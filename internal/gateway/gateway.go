// Command gateway is the single deployable Go ADK HTTP service: it mounts
// every registered agent's AG-UI routes behind Clerk auth (except the
// public /resume slice), persists sessions, pending client-tool calls, and artifacts in
// SQLite. See README.md.
package gateway

import (
	"context"
	"crypto/subtle"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"log"
	"maps"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/agui"
	"github.com/aranlucas/agents/internal/app"
	"github.com/aranlucas/agents/internal/auth"
	"github.com/aranlucas/agents/internal/bootstrap"
	"github.com/aranlucas/agents/internal/catalog"
	"github.com/aranlucas/agents/internal/clerk"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/fitnessdata"
	"github.com/aranlucas/agents/internal/groceries"
	"github.com/aranlucas/agents/internal/observability"
	"github.com/aranlucas/agents/internal/telegram"

	"github.com/joho/godotenv"
	"google.golang.org/adk/v2/session"
)

const healthCheckTimeout = 3 * time.Second

type startupTimer struct {
	enabled bool
	start   time.Time
	last    time.Time
}

func newStartupTimer() startupTimer {
	start := time.Now()
	// Tracing is enabled from config.Config.StartupTrace once it is loaded.
	return startupTimer{start: start, last: start}
}

func (timer *startupTimer) mark(phase string) {
	if !timer.enabled {
		return
	}
	now := time.Now()
	log.Printf("startup phase=%s elapsed=%s delta=%s", phase, now.Sub(timer.start), now.Sub(timer.last))
	timer.last = now
}

type handlerState struct {
	handler http.Handler
}

// handlerSwitcher publishes the public Resume surface first, then atomically
// swaps in the complete gateway once the remaining agents have been built.
// Requests never observe a partially-built mux. The build starts on the first
// request for a non-Resume route; if it fails, those routes answer 503 and
// /ready reports the failure instead of silently serving 404s.
type handlerSwitcher struct {
	current atomic.Pointer[handlerState]

	mu      sync.Mutex
	hydrate func()
	started bool
	done    chan struct{}
	failed  atomic.Bool
}

func newHandlerSwitcher(initial http.Handler) *handlerSwitcher {
	switcher := &handlerSwitcher{}
	switcher.Swap(initial)
	return switcher
}

func (switcher *handlerSwitcher) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if switcher.hydrate != nil && fullGatewayPath(r.URL.Path) {
		switcher.start()
		select {
		case <-switcher.done:
		case <-r.Context().Done():
			return
		}
		if switcher.failed.Load() {
			writeGatewayJSONError(w, http.StatusServiceUnavailable, "agents_unavailable")
			return
		}
	}
	state := switcher.current.Load()
	if state == nil || state.handler == nil {
		http.Error(w, "gateway is initializing", http.StatusServiceUnavailable)
		return
	}
	state.handler.ServeHTTP(w, r)
}

// hydrateOnDemand registers the build for the full surface. The returned
// channel closes when the build finishes or when stop cancels a build that
// never started.
func (switcher *handlerSwitcher) hydrateOnDemand(build func()) <-chan struct{} {
	switcher.hydrate = build
	switcher.done = make(chan struct{})
	return switcher.done
}

func (switcher *handlerSwitcher) start() {
	switcher.mu.Lock()
	defer switcher.mu.Unlock()
	if switcher.started {
		return
	}
	switcher.started = true
	go func() {
		defer close(switcher.done)
		switcher.hydrate()
	}()
}

// stop prevents a build from starting during shutdown.
func (switcher *handlerSwitcher) stop() {
	switcher.mu.Lock()
	defer switcher.mu.Unlock()
	if switcher.hydrate != nil && !switcher.started {
		switcher.started = true
		close(switcher.done)
	}
}

func (switcher *handlerSwitcher) fail() { switcher.failed.Store(true) }

// status reports the full surface for /ready: "pending" until the first
// non-Resume request builds it, then "ok" or "failed".
func (switcher *handlerSwitcher) status() string {
	if switcher == nil || switcher.hydrate == nil {
		return "ok"
	}
	select {
	case <-switcher.done:
		if switcher.failed.Load() {
			return "failed"
		}
		switcher.mu.Lock()
		defer switcher.mu.Unlock()
		if !switcher.started {
			return "pending"
		}
		return "ok"
	default:
		return "pending"
	}
}

var fullGatewayPrefixes = func() []string {
	prefixes := []string{"/info", "/threads", "/api/grocery", "/fitness/activities", "/telegram/link"}
	for _, spec := range catalog.All() {
		if spec.Route == "resume" {
			continue
		}
		prefixes = append(prefixes, "/"+spec.Route, "/agent/"+spec.ClientID)
	}
	return prefixes
}()

func fullGatewayPath(path string) bool {
	for _, prefix := range fullGatewayPrefixes {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func (switcher *handlerSwitcher) Swap(next http.Handler) {
	if next == nil {
		return
	}
	switcher.current.Store(&handlerState{handler: next})
}

// Dependencies are the gateway's externally-constructed collaborators.
// Production values are built in main(); tests supply fakes so route
// composition can be exercised without a database or a real model provider.
type Dependencies struct {
	Registry *agentruntime.Registry
	Sessions session.Service
	Pending  agui.PendingTools
	Verifier auth.TokenVerifier
	// Database gates /ready on the migrated schema.
	Database common.HealthChecker
	// AgentsStatus reports the lazily built agent surface ("pending", "ok",
	// or "failed"); nil means the surface is always complete.
	AgentsStatus func() string
	Stream       agui.StreamSmoothing
	Links        *telegram.LinkStore
	Clerk        clerk.Backend
	Fitness      fitnessdata.Repository
	Groceries    groceries.LibraryRepository
	Shopping     groceries.ShoppingRepository
	// KrogerMCPURL is reduced to its origin before the lazy account linker
	// requests /userinfo; the MCP path itself is never reused as a base path.
	KrogerMCPURL string
	Now          func() time.Time
}

// New composes the gateway's HTTP surface: per-agent AG-UI run, state, and
// capability routes registered from every agentruntime.Entry in
// deps.Registry, a root /health, Clerk auth (bypassed only for entries
// marked Public), and the configured browser-origin policy. It mounts the
// one prebuilt AG-UI handler per entry and a shared state handler. Binding
// the agent at construction validates and reuses its ADK runner across runs.
// The grocery REST surface is optional so a latency-critical partial surface
// can be assembled without loading its OpenAPI validator or background store.
func New(cfg config.Config, deps Dependencies) (http.Handler, error) {
	if deps.Registry == nil {
		return nil, errors.New("agent registry is required")
	}
	if deps.Sessions == nil {
		return nil, errors.New("session service is required")
	}
	if deps.Now == nil {
		deps.Now = time.Now
	}
	if deps.Groceries != nil && deps.Shopping == nil {
		deps.Shopping, _ = deps.Groceries.(groceries.ShoppingRepository)
	}

	stateHandler := agui.StateHandler(deps.Registry, deps.Sessions)

	mux := http.NewServeMux()
	publicRoutes := map[string]bool{
		"/health": true, "/live": true, "/ready": true,
		"/api/grocery/*": true,
	}

	stream := deps.Stream
	if stream == (agui.StreamSmoothing{}) {
		stream = agui.DefaultStreamSmoothing()
	}
	runtime, err := agui.NewCopilotKitRuntime(
		deps.Registry,
		deps.Sessions,
		frontendAgentID,
		agui.WithPendingTools(deps.Pending),
		agui.WithTextStreamSmoothing(stream.Enabled, stream.Chunking, stream.ChunkDelay, stream.CharsPerChunk),
	)
	if err != nil {
		return nil, fmt.Errorf("build CopilotKit runtime: %w", err)
	}
	runtime.Register(mux)
	maps.Copy(publicRoutes, runtime.PublicRoutes())

	for _, entry := range deps.Registry.Entries() {
		base := "/" + entry.Route
		handler, ok := runtime.EntryHandler(entry.Route)
		if !ok {
			return nil, fmt.Errorf("CopilotKit runtime missing handler for %s", entry.Route)
		}
		mux.Handle("POST "+base+"/agui", handler)
		mux.Handle("POST "+base+"/agents/state", stateHandler)
		mux.HandleFunc("GET "+base+"/agui/capabilities", capabilitiesHandler)
		mux.HandleFunc("GET "+base+"/health", agentHealthHandler(entry))

		// Capabilities and health are metadata, not user data: safe to
		// read without identity for every agent, public or not.
		publicRoutes[base+"/agui/capabilities"] = true
		publicRoutes[base+"/health"] = true
		if entry.Public {
			publicRoutes[base+"/agui"] = true
			publicRoutes[base+"/agents/state"] = true
		}
	}

	mux.HandleFunc("GET /live", livenessHandler(deps))
	mux.HandleFunc("GET /ready", rootHealthHandler(deps))
	// Keep /health as a readiness alias for existing monitors and clients.
	mux.HandleFunc("GET /health", rootHealthHandler(deps))
	if deps.Links != nil && cfg.TelegramLinkSecret != "" {
		mux.HandleFunc("POST /telegram/link/consume", telegramLinkConsumeHandler(cfg.TelegramLinkSecret, deps.Links))
		mux.HandleFunc("POST /telegram/link/resolve", telegramLinkResolveHandler(cfg.TelegramLinkSecret, deps.Links))
		publicRoutes["/telegram/link/consume"] = true
		publicRoutes["/telegram/link/resolve"] = true
	}
	if deps.Fitness != nil {
		mux.HandleFunc("POST /fitness/activities/sync", fitnessSyncHandler(deps.Fitness, deps.Now))
	}
	if deps.Groceries != nil {
		if err := registerGroceryAPI(mux, deps.Groceries, deps.Shopping, deps.Now); err != nil {
			return nil, fmt.Errorf("register grocery API: %w", err)
		}
	}
	var krogerLinker *krogerLinker
	if deps.Shopping != nil {
		krogerLinker = newKrogerLinker(deps.Shopping, deps.KrogerMCPURL, nil)
	}

	var verifiers []auth.TokenVerifier
	if deps.Verifier != nil {
		verifiers = append(verifiers, deps.Verifier)
	}
	// auth.RequireIdentity fails closed: any path absent from publicRoutes
	// gets a 401, including paths no agent ever registered. That is the
	// right default for a genuinely mounted-but-protected route, but it
	// would also turn a plain typo'd or unscoped path (e.g. bare
	// /agents/state, with no agent prefix) into a 401 instead of a 404 —
	// leaking route-existence information from the outermost middleware
	// before mux ever sees the request. Route unmatched paths straight to
	// mux (its normal 404) and only push matched paths through the auth
	// gate.
	protected := auth.RequireIdentity(publicRoutes, withOAuthCredentials(deps.Clerk, krogerLinker, mux), verifiers...)
	var groceryProtected http.Handler
	if deps.Groceries != nil {
		groceryVerifiers := append([]auth.TokenVerifier{}, verifiers...)
		groceryVerifiers = append(groceryVerifiers, newKrogerTokenVerifier(deps.Shopping, deps.KrogerMCPURL, nil))
		groceryProtected = auth.RequireIdentity(nil, mux, groceryVerifiers...)
	}
	routed := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern == "" {
			mux.ServeHTTP(w, r)
			return
		}
		if groceryProtected != nil && strings.HasPrefix(r.URL.Path, "/api/grocery/") {
			groceryProtected.ServeHTTP(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})
	return auth.CORS(cfg.HTTP.Origins, routed), nil
}

func frontendAgentID(route string) string {
	if spec, ok := catalog.ByRoute(route); ok {
		return spec.ClientID
	}
	return route
}

// withOAuthCredentials resolves provider access tokens inside the trusted
// Railway process after Clerk authentication. Direct browser-to-AG-UI clients
// therefore only carry their Clerk session JWT; third-party OAuth tokens never
// pass through the browser or the Vercel app.
func withOAuthCredentials(backend clerk.Backend, linker *krogerLinker, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := auth.FromContext(r.Context())
		if backend == nil || !ok || identity.Public || !routeNeedsOAuth(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		connections, err := backend.OAuthConnections(r.Context(), identity.UserID)
		if err != nil {
			log.Printf("resolve agent OAuth credentials: user=%s path=%s err=%v", identity.UserID, r.URL.Path, err)
			writeGatewayJSONError(w, http.StatusServiceUnavailable, "oauth_credentials_unavailable")
			return
		}

		clone := r.Clone(r.Context())
		clone.Header = r.Header.Clone()
		clone.Header.Del("X-Kroger-Access-Token")
		if connections.KrogerToken != "" {
			clone.Header.Set("X-Kroger-Access-Token", connections.KrogerToken)
			if linker != nil {
				clerkUserID, krogerToken := identity.UserID, connections.KrogerToken
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					linker.Ensure(ctx, clerkUserID, krogerToken)
				}()
			}
		}
		next.ServeHTTP(w, clone)
	})
}

func routeNeedsOAuth(path string) bool {
	return strings.HasPrefix(path, "/grocery/") ||
		strings.HasPrefix(path, "/wellness/") ||
		strings.HasPrefix(path, "/agent/grocery/") ||
		strings.HasPrefix(path, "/agent/wellness/")
}

type telegramLinkConsumeRequest struct {
	Token       string `json:"token"`
	ClerkUserID string `json:"clerk_user_id"`
}

type telegramLinkConsumeResponse struct {
	OK             bool  `json:"ok"`
	TelegramUserID int64 `json:"telegram_user_id"`
}

type telegramLinkResolveRequest struct {
	TelegramUserID int64 `json:"telegram_user_id"`
}

type telegramLinkResolveResponse struct {
	ClerkUserID string `json:"clerk_user_id"`
}

type telegramLinkLookup interface {
	Lookup(context.Context, int64) (telegram.AccountLink, bool, error)
}

type agentHealthResponse struct {
	Status string `json:"status"`
	Agent  string `json:"agent"`
}

type rootHealthResponse struct {
	Status  string            `json:"status"`
	Service string            `json:"service"`
	Time    string            `json:"time"`
	Checks  map[string]string `json:"checks"`
}

type livenessResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Time    string `json:"time"`
}

func telegramLinkConsumeHandler(secret string, links *telegram.LinkStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !validTelegramLinkSecret(r.Header.Get("x-telegram-link-secret"), secret) {
			writeGatewayJSONError(w, http.StatusUnauthorized, "invalid_link_secret")
			return
		}
		var input telegramLinkConsumeRequest
		decodeErr := json.UnmarshalRead(http.MaxBytesReader(w, r.Body, 8<<10), &input, json.RejectUnknownMembers(true))
		if decodeErr != nil || strings.TrimSpace(input.Token) == "" || strings.TrimSpace(input.ClerkUserID) == "" {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_link_request")
			return
		}
		link, err := links.Consume(r.Context(), input.Token, input.ClerkUserID)
		if err != nil {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_or_expired_link_token")
			return
		}
		if err := common.WriteJSON(w, http.StatusOK, telegramLinkConsumeResponse{OK: true, TelegramUserID: link.TelegramUserID}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
}

func telegramLinkResolveHandler(secret string, links telegramLinkLookup) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !validTelegramLinkSecret(r.Header.Get("x-telegram-link-secret"), secret) {
			writeGatewayJSONError(w, http.StatusUnauthorized, "invalid_link_secret")
			return
		}
		var input telegramLinkResolveRequest
		decodeErr := json.UnmarshalRead(http.MaxBytesReader(w, r.Body, 8<<10), &input, json.RejectUnknownMembers(true))
		if decodeErr != nil || input.TelegramUserID <= 0 {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_link_request")
			return
		}
		link, linked, err := links.Lookup(r.Context(), input.TelegramUserID)
		if err != nil {
			writeGatewayJSONError(w, http.StatusServiceUnavailable, "link_lookup_failed")
			return
		}
		if !linked {
			writeGatewayJSONError(w, http.StatusNotFound, "telegram_account_not_linked")
			return
		}
		if err := common.WriteJSON(w, http.StatusOK, telegramLinkResolveResponse{ClerkUserID: link.ClerkUserID}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
}

func validTelegramLinkSecret(provided, expected string) bool {
	return expected != "" && len(provided) == len(expected) && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func writeGatewayJSONError(w http.ResponseWriter, status int, code string) {
	if err := common.WriteJSON(w, status, map[string]string{"error": code}); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

// capabilitiesHandler advertises only the AG-UI features the Go runtime's
// agui.Handler actually implements (see internal/agui/handler.go and
// converter.go): SSE streaming, STATE_SNAPSHOT/STATE_DELTA, and reasoning
// message events. tools.supported is false because no agent built via this
// vertical slice attaches static or request-scoped client tools yet.
func capabilitiesHandler(w http.ResponseWriter, _ *http.Request) {
	if err := common.WriteJSON(w, http.StatusOK, agui.DefaultAgentCapabilities()); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

// agentHealthHandler reports one agent's readiness via entry.Health, which
// must never call a model provider (see resumeHealth). A nil Health always
// reports healthy.
func agentHealthHandler(entry agentruntime.Entry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), healthCheckTimeout)
		defer cancel()
		status, code := "ok", http.StatusOK
		if entry.Health != nil {
			if err := entry.Health(ctx); err != nil {
				status, code = "degraded", http.StatusServiceUnavailable
			}
		}
		if err := common.WriteJSON(w, code, agentHealthResponse{Status: status, Agent: entry.AppName}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
}

// livenessHandler reports only process responsiveness. Database and agent
// checks belong to /ready so an upstream outage does not make the process look
// dead to operators or image smokes.
func livenessHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if err := common.WriteJSON(w, http.StatusOK, livenessResponse{
			Status: "ok", Service: "agents-gateway", Time: deps.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
}

// rootHealthHandler checks the database schema through healthCheckTimeout and
// reports the agent surface. A surface that is still pending (built on first
// use) is healthy; one that failed to build is not. It never calls a model
// provider or echoes credentials.
func rootHealthHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), healthCheckTimeout)
		defer cancel()

		checks := common.ReadyChecks(ctx, map[string]common.HealthChecker{"database": deps.Database})
		if deps.AgentsStatus != nil {
			checks["agents"] = deps.AgentsStatus()
		}

		status, code := "ok", http.StatusOK
		for _, value := range checks {
			if value != "ok" && value != "pending" {
				status, code = "degraded", http.StatusServiceUnavailable
			}
		}

		if err := common.WriteJSON(w, code, rootHealthResponse{
			Status: status, Service: "agents-gateway",
			Time: deps.Now().UTC().Format(time.RFC3339), Checks: checks,
		}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
}

// Run serves the gateway until ctx is canceled. It publishes the public Resume
// surface first and builds the remaining agents on the first request that
// needs them, so a sleeping Railway service wakes quickly for Resume visitors.
func Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	startup := newStartupTimer()
	// Load local development values without overriding explicitly exported env vars.
	if err := godotenv.Load(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("load .env: %v", err)
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "development") {
		for _, key := range []string{"RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"} {
			_ = os.Unsetenv(key)
		}
	}

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	if err := app.ValidateProviders(cfg.Providers); err != nil {
		return fmt.Errorf("validate model providers: %w", err)
	}
	startup.enabled = cfg.StartupTrace
	startup.mark("config")
	flushSentry, err := observability.SetupSentry(observability.Config{
		ServiceName: "agents-gateway", ServiceVersion: cfg.Version,
		Environment: string(cfg.Environment), DSN: cfg.SentryDSN,
	})
	if err != nil {
		return fmt.Errorf("configure Sentry: %w", err)
	}
	defer flushSentry()
	startup.mark("sentry")

	rt, err := app.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = rt.Close() }()
	startup.mark("database")

	agentToolset := agui.NewAGUIToolset(rt.Pending)
	resumeBinding, err := app.BuildResume(rt, agentToolset)
	if err != nil {
		return err
	}
	resumeSpec, ok := catalog.ByRoute("resume")
	if !ok {
		return errors.New("build Resume registry: catalog route is missing")
	}
	resumeRegistry, err := (bootstrap.Specialists{Resume: resumeBinding}).RegistryFor([]catalog.Spec{resumeSpec})
	if err != nil {
		return fmt.Errorf("build Resume registry: %w", err)
	}
	startup.mark("resume")

	var switcher *handlerSwitcher
	agentsStatus := func() string { return switcher.status() }
	stream := agui.StreamSmoothingFromEnv(os.Getenv)
	resumeHandler, err := New(cfg, Dependencies{
		Registry: resumeRegistry, Sessions: rt.Sessions, Pending: rt.Pending,
		Database: rt.DB, AgentsStatus: agentsStatus, Stream: stream, Now: time.Now,
	})
	if err != nil {
		return fmt.Errorf("build Resume gateway: %w", err)
	}
	switcher = newHandlerSwitcher(resumeHandler)
	startup.mark("handler")

	server := &http.Server{
		Addr:    ":" + cfg.HTTP.Port,
		Handler: observability.WrapSentry(switcher),
		// Long enough that a slow client filling headers can't hold a
		// connection open indefinitely, short enough not to mask a hung
		// upstream. WriteTimeout is generous because AG-UI runs stream SSE
		// for the lifetime of one agent turn.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       120 * time.Second,
	}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return fmt.Errorf("gateway listener failed: %w", err)
	}

	var specialists *app.Specialists
	hydrate := func() error {
		built, err := app.BuildSpecialists(ctx, rt, resumeBinding, agentToolset)
		if err != nil {
			return err
		}
		specialists = built
		registry, err := built.Registry()
		if err != nil {
			return fmt.Errorf("build agent registry: %w", err)
		}
		var verifier auth.TokenVerifier
		if cfg.ClerkJWKS != "" {
			if verifier, err = auth.NewClerkVerifier(cfg.ClerkJWKS, cfg.ClerkIssuer, "", nil); err != nil {
				return fmt.Errorf("configure Clerk verifier: %w", err)
			}
		}
		var clerkBackend clerk.Backend
		if cfg.ClerkSecret != "" {
			if clerkBackend, err = clerk.NewBackend(common.NewHTTPClient(15*time.Second, 1<<20).Client, "", cfg.ClerkSecret); err != nil {
				return fmt.Errorf("configure Clerk backend: %w", err)
			}
		}
		complete, err := New(cfg, Dependencies{
			Registry: registry, Sessions: rt.Sessions, Pending: rt.Pending, Verifier: verifier,
			Database: rt.DB, AgentsStatus: agentsStatus, Links: rt.Links, Clerk: clerkBackend,
			Fitness: rt.Fitness, Groceries: rt.Groceries, Shopping: rt.Groceries,
			KrogerMCPURL: cfg.Integrations.KrogerMCPURL, Stream: stream, Now: time.Now,
		})
		if err != nil {
			return fmt.Errorf("build gateway: %w", err)
		}
		switcher.Swap(complete)
		if startup.enabled {
			log.Printf("startup phase=full-surface-ready elapsed=%s", time.Since(startup.start))
		}
		return nil
	}
	hydrateDone := switcher.hydrateOnDemand(func() {
		if err := hydrate(); err != nil {
			observability.CaptureError(context.Background(), err)
			log.Printf("agent hydration failed: %v", err)
			switcher.fail()
		}
	})
	defer func() { _ = specialists.Close() }()

	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		log.Printf("shutting down agents gateway")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("gateway server shutdown failed: %v", err)
		}
	}()
	log.Printf("agents gateway listening on :%s", cfg.HTTP.Port)
	startup.mark("listening")
	serveErr := server.Serve(listener)
	cancel()
	<-shutdownDone
	switcher.stop()
	select {
	case <-hydrateDone:
	case <-time.After(5 * time.Second):
		log.Printf("gateway hydration did not finish before shutdown")
	}
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		observability.CaptureError(context.Background(), serveErr)
		return fmt.Errorf("gateway server failed: %w", serveErr)
	}
	return nil
}
