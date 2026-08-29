// Command gateway is the single deployable Go ADK HTTP service: it mounts
// every registered agent's AG-UI routes behind Clerk auth (except the
// public /resume slice), persists sessions and pending client-tool calls in
// D1, and serves artifacts from R2. See AGENTS.md's Architecture section.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"maps"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"agents/expense"
	"agents/fitness"
	"agents/grocery"
	"agents/internal/agentruntime"
	"agents/internal/agui"
	"agents/internal/auth"
	"agents/internal/bootstrap"
	"agents/internal/bravesearch"
	"agents/internal/catalog"
	"agents/internal/clerk"
	"agents/internal/cloudflare"
	"agents/internal/common"
	"agents/internal/config"
	"agents/internal/fitnessdata"
	"agents/internal/groceries"
	"agents/internal/observability"
	"agents/internal/providerpolicy"
	"agents/internal/providers/openai"
	"agents/internal/rate"
	"agents/internal/telegram"
	"agents/interview"
	"agents/jobs"
	"agents/oralboards"
	"agents/presentation"
	"agents/research"
	"agents/resume"
	"agents/spreadsheet"
	"agents/travel"
	"agents/trends"
	"agents/wellness"
	"cloud.google.com/go/bigquery"
	"github.com/joho/godotenv"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/session"
	"google.golang.org/api/option"
	"google.golang.org/genai"
)

const healthCheckTimeout = 3 * time.Second
const (
	defaultStreamCharsPerChunk = 64
	defaultStreamChunkDelayMs  = 18
	defaultStreamChunking      = "word"
)

// healthChecker is satisfied by *cloudflare.D1 and *cloudflare.R2. It is
// declared here (not in cloudflare) so Dependencies can be exercised with
// lightweight fakes in tests without touching real Cloudflare credentials.
type healthChecker interface {
	Health(context.Context) error
}

// Dependencies are the gateway's externally-constructed collaborators.
// Production values are built in main(); tests supply fakes so route
// composition can be exercised without D1, R2, or a real model provider.
type Dependencies struct {
	Registry  *agentruntime.Registry
	Sessions  session.Service
	Pending   agui.PendingTools
	Verifier  auth.TokenVerifier
	D1        healthChecker
	R2        healthChecker
	Links     *telegram.LinkStore
	Clerk     clerk.Backend
	Fitness   fitnessdata.Repository
	Groceries groceries.LibraryRepository
	Shopping  groceries.ShoppingRepository
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
func New(cfg config.Config, deps Dependencies) (http.Handler, error) {
	if deps.Registry == nil {
		return nil, errors.New("agent registry is required")
	}
	if deps.Sessions == nil {
		return nil, errors.New("session service is required")
	}
	if deps.Groceries == nil {
		return nil, errors.New("grocery library repository is required")
	}
	if deps.Now == nil {
		deps.Now = time.Now
	}
	if deps.Shopping == nil {
		deps.Shopping, _ = deps.Groceries.(groceries.ShoppingRepository)
	}

	stateHandler := agui.StateHandler(deps.Registry, deps.Sessions)

	mux := http.NewServeMux()
	publicRoutes := map[string]bool{
		"/health": true, "/live": true, "/ready": true,
		"/api/grocery/*": true,
	}

	enabled, chunking, charsPerChunk, delay := parseStreamSmoothingConfigFromEnv()
	runtime, err := agui.NewCopilotKitRuntime(
		deps.Registry,
		deps.Sessions,
		frontendAgentID,
		agui.WithPendingTools(deps.Pending),
		agui.WithTextStreamSmoothing(enabled, chunking, delay, charsPerChunk),
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
	if err := registerGroceryAPI(mux, deps.Groceries, deps.Shopping, deps.Now); err != nil {
		return nil, fmt.Errorf("register grocery API: %w", err)
	}
	krogerLinker := newKrogerLinker(deps.Shopping, deps.KrogerMCPURL, nil)

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
	groceryVerifiers := append([]auth.TokenVerifier{}, verifiers...)
	groceryVerifiers = append(groceryVerifiers, newKrogerTokenVerifier(deps.Shopping, deps.KrogerMCPURL, nil))
	groceryProtected := auth.RequireIdentity(nil, mux, groceryVerifiers...)
	routed := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern == "" {
			mux.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/grocery/") {
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

func parseStreamSmoothingConfigFromEnv() (bool, string, int, time.Duration) {
	chunking := defaultStreamChunking
	if rawChunking := strings.TrimSpace(strings.ToLower(os.Getenv("AGUI_STREAM_CHUNKING"))); rawChunking != "" {
		chunking = rawChunking
	}
	enabled := true
	if rawEnabled := strings.TrimSpace(os.Getenv("AGUI_STREAM_SMOOTHING")); rawEnabled != "" {
		parsed, err := strconv.ParseBool(rawEnabled)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_SMOOTHING=%q, defaulting to true", rawEnabled)
		} else {
			enabled = parsed
		}
	}

	charsPerChunk := defaultStreamCharsPerChunk
	if rawChunkSize := strings.TrimSpace(os.Getenv("AGUI_STREAM_CHUNK_SIZE")); rawChunkSize != "" {
		parsed, err := strconv.Atoi(rawChunkSize)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_CHUNK_SIZE=%q, defaulting to %d", rawChunkSize, charsPerChunk)
		} else if parsed > 0 {
			charsPerChunk = parsed
		} else {
			log.Printf("AGUI_STREAM_CHUNK_SIZE=%d must be >0, using %d", parsed, charsPerChunk)
		}
	}

	chunkDelay := time.Duration(defaultStreamChunkDelayMs) * time.Millisecond
	if rawDelay := strings.TrimSpace(os.Getenv("AGUI_STREAM_CHUNK_DELAY_MS")); rawDelay != "" {
		parsed, err := strconv.Atoi(rawDelay)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_CHUNK_DELAY_MS=%q, defaulting to %dms", rawDelay, defaultStreamChunkDelayMs)
		} else if parsed >= 0 {
			chunkDelay = time.Duration(parsed) * time.Millisecond
		} else {
			log.Printf("AGUI_STREAM_CHUNK_DELAY_MS=%d is negative, using %dms", parsed, defaultStreamChunkDelayMs)
		}
	}

	return enabled, chunking, charsPerChunk, chunkDelay
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

type capabilityFlag struct {
	Streaming bool `json:"streaming"`
}

type stateCapabilities struct {
	Snapshots       bool `json:"snapshots"`
	Deltas          bool `json:"deltas"`
	PersistentState bool `json:"persistentState"`
}

type reasoningCapabilities struct {
	Supported bool `json:"supported"`
	Streaming bool `json:"streaming"`
}

type toolCapabilities struct {
	Supported      bool `json:"supported"`
	ClientProvided bool `json:"clientProvided"`
}

type capabilitiesResponse struct {
	Transport capabilityFlag        `json:"transport"`
	State     stateCapabilities     `json:"state"`
	Reasoning reasoningCapabilities `json:"reasoning"`
	Tools     toolCapabilities      `json:"tools"`
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
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
		decoder.DisallowUnknownFields()
		decodeErr := decoder.Decode(&input)
		var trailing struct{}
		trailingErr := decoder.Decode(&trailing)
		if decodeErr != nil || !errors.Is(trailingErr, io.EOF) || strings.TrimSpace(input.Token) == "" || strings.TrimSpace(input.ClerkUserID) == "" {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_link_request")
			return
		}
		link, err := links.Consume(r.Context(), input.Token, input.ClerkUserID)
		if err != nil {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_or_expired_link_token")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(telegramLinkConsumeResponse{OK: true, TelegramUserID: link.TelegramUserID})
	}
}

func telegramLinkResolveHandler(secret string, links telegramLinkLookup) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !validTelegramLinkSecret(r.Header.Get("x-telegram-link-secret"), secret) {
			writeGatewayJSONError(w, http.StatusUnauthorized, "invalid_link_secret")
			return
		}
		var input telegramLinkResolveRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
		decoder.DisallowUnknownFields()
		decodeErr := decoder.Decode(&input)
		var trailing struct{}
		trailingErr := decoder.Decode(&trailing)
		if decodeErr != nil || !errors.Is(trailingErr, io.EOF) || input.TelegramUserID <= 0 {
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
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(telegramLinkResolveResponse{ClerkUserID: link.ClerkUserID})
	}
}

func validTelegramLinkSecret(provided, expected string) bool {
	return expected != "" && len(provided) == len(expected) && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func writeGatewayJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

// capabilitiesHandler advertises only the AG-UI features the Go runtime's
// agui.Handler actually implements (see internal/agui/handler.go and
// converter.go): SSE streaming, STATE_SNAPSHOT/STATE_DELTA, and reasoning
// message events. tools.supported is false because no agent built via this
// vertical slice attaches static or request-scoped client tools yet.
func capabilitiesHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(capabilitiesResponse{
		Transport: capabilityFlag{Streaming: true},
		State:     stateCapabilities{Snapshots: true, Deltas: true, PersistentState: true},
		Reasoning: reasoningCapabilities{Supported: true, Streaming: true},
		Tools:     toolCapabilities{Supported: true, ClientProvided: true},
	})
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
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(agentHealthResponse{Status: status, Agent: entry.AppName})
	}
}

// livenessHandler reports only process responsiveness. Remote D1/R2/schema
// checks belong to /ready so an upstream outage does not make the process look
// dead to operators or image smokes.
func livenessHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(livenessResponse{
			Status: "ok", Service: "agents-gateway", Time: deps.Now().UTC().Format(time.RFC3339),
		})
	}
}

// rootHealthHandler checks D1 and R2 once each through healthCheckTimeout,
// and never calls a model provider or echoes credentials: the response
// contains only status strings and process metadata.
func rootHealthHandler(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), healthCheckTimeout)
		defer cancel()

		checks := map[string]string{}
		var mu sync.Mutex
		var wg sync.WaitGroup
		record := func(name string, checker healthChecker) {
			defer wg.Done()
			status := "unconfigured"
			if checker != nil {
				status = "ok"
				if err := checker.Health(ctx); err != nil {
					status = "unavailable"
				}
			}
			mu.Lock()
			checks[name] = status
			mu.Unlock()
		}
		wg.Add(2)
		go record("d1", deps.D1)
		go record("r2", deps.R2)
		wg.Wait()

		status, code := "ok", http.StatusOK
		for _, value := range checks {
			if value != "ok" {
				status, code = "degraded", http.StatusServiceUnavailable
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(rootHealthResponse{
			Status: status, Service: "agents-gateway",
			Time: deps.Now().UTC().Format(time.RFC3339), Checks: checks,
		})
	}
}

// trendsBigQueryClient builds the official Go BigQuery client billed to
// GOOGLE_CLOUD_PROJECT (the project of the trends agent's own GCP service
// account), authenticated from GOOGLE_APPLICATION_CREDENTIALS_JSON when set
// or Application Default Credentials otherwise — the same two-variable
// contract the Python port's _credentials.py bootstrapped, minus the temp
// file: cloud.google.com/go/bigquery accepts service-account JSON directly.
// The queried dataset itself (bigquery-public-data.google_trends) is a
// separate, hardcoded allowlist enforced by trends.NewBigQueryExecutor, not
// this billing project.
func trendsBigQueryClient(ctx context.Context) (*bigquery.Client, error) {
	credentials := strings.TrimSpace(os.Getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON"))
	if credentials == "" {
		return nil, errors.New("GOOGLE_APPLICATION_CREDENTIALS_JSON is required to configure the trends agent's BigQuery client")
	}
	var sa struct {
		ProjectID string `json:"project_id"`
	}
	if json.Unmarshal([]byte(credentials), &sa) != nil || sa.ProjectID == "" {
		return nil, errors.New("GOOGLE_APPLICATION_CREDENTIALS_JSON must contain a valid service account with project_id")
	}
	client, err := bigquery.NewClient(ctx, sa.ProjectID, option.WithAuthCredentialsJSON(option.ServiceAccount, []byte(credentials)))
	if err != nil {
		return nil, fmt.Errorf("configure BigQuery client: %w", err)
	}
	return client, nil
}

func oralboardsModels(ctx context.Context) (oralboards.PhaseModels, error) {
	policy := providerpolicy.GatewayOralBoards()
	key := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if key == "" {
		return oralboards.PhaseModels{}, errors.New("GEMINI_API_KEY is required to configure oralboards case builder")
	}
	caseBuilder, err := gemini.NewModel(ctx, policy.GeminiModel, oralboardsGeminiClientConfig(key))
	if err != nil {
		return oralboards.PhaseModels{}, err
	}
	// Every phase is a separate agent node, so sharing the official Gemini client
	// does not couple their conversations. A single provider also avoids losing
	// an in-progress examination to cross-provider response incompatibilities.
	return oralboards.PhaseModels{CaseBuilder: caseBuilder, Questioner: caseBuilder, Evaluator: caseBuilder, Scorer: caseBuilder}, nil
}

// oralboardsGeminiClientConfig keeps transient provider failures inside the
// model request that encountered them. ADK's workflow RetryConfig reactivates
// an entire node; that is unsafe for oral-board phases whose agents may already
// have mutated examination state through tools before a later model call fails.
//
// The Gen AI SDK documents HTTPRetryOptions as the request-level retry seam.
// A non-nil empty policy enables its maintained defaults: five total attempts,
// an approximately one-second initial delay, exponential backoff with jitter,
// and retries limited to transport failures plus 408, 429, and selected 5xx
// responses. Keep those defaults centralized in the provider SDK rather than
// copying values here and allowing the policies to drift.
func oralboardsGeminiClientConfig(apiKey string) *genai.ClientConfig {
	return &genai.ClientConfig{
		APIKey:      apiKey,
		Backend:     genai.BackendGeminiAPI,
		HTTPOptions: genai.HTTPOptions{RetryOptions: &genai.HTTPRetryOptions{}},
	}
}

// resumeHealth reports the resume agent's readiness from local state only
// (embedded grounding present, model wired at startup) — it never issues a
// model request, so GET /resume/health cannot burn provider quota or block
// on an upstream outage.
func resumeHealth(m model.LLM) func(context.Context) error {
	return func(context.Context) error {
		if strings.TrimSpace(resume.Instruction) == "" {
			return errors.New("resume instruction is empty")
		}
		if m == nil || strings.TrimSpace(m.Name()) == "" {
			return errors.New("resume model is not configured")
		}
		return nil
	}
}

func main() {
	// Load local development values without overriding explicitly exported env vars.
	for _, path := range []string{".env", "../.env"} {
		if err := godotenv.Load(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("load %s: %v", path, err)
		}
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "development") {
		for _, key := range []string{"RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"} {
			_ = os.Unsetenv(key)
		}
	}

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	telemetryConfig := observability.Config{
		ServiceName: "agents-gateway", ServiceVersion: os.Getenv("RAILWAY_GIT_COMMIT_SHA"),
		Environment: string(cfg.Environment),
	}
	flushSentry, err := observability.SetupSentry(telemetryConfig)
	if err != nil {
		log.Fatalf("configure Sentry: %v", err)
	}
	defer flushSentry()

	d1, err := cloudflare.NewD1(cfg.Cloudflare, nil)
	if err != nil {
		log.Fatalf("configure D1: %v", err)
	}
	r2, err := cloudflare.NewR2(cfg.Cloudflare)
	if err != nil {
		log.Fatalf("configure R2: %v", err)
	}

	sessions := cloudflare.NewSessionService(d1, time.Now)
	pending := cloudflare.NewPendingStore(d1, time.Now)
	limiter := rate.NewProviderLimiter(d1, time.Now)
	availableProviders := providerpolicy.FallbackProviders(cfg.Providers)
	var braveSearch *bravesearch.Client
	if braveKey := strings.TrimSpace(os.Getenv("BRAVE_API_KEY")); braveKey != "" {
		braveSearch, err = bravesearch.New(common.NewHTTPClient(15*time.Second, 4<<20).Client, "https://api.search.brave.com/res/v1/web/search", braveKey, 10)
		if err != nil {
			log.Fatalf("configure Brave search: %v", err)
		}
	}

	resumeProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Resume)
	if err != nil {
		log.Fatalf("configure resume model: %v", err)
	}
	resumeModel := openai.New(resumeProvider, nil, limiter)
	resumeAgent, err := resume.New(resumeModel, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build resume agent: %v", err)
	}
	jobsWebLoader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	jobsAgent, err := jobs.New(resumeModel, braveSearch, jobsWebLoader, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build jobs agent: %v", err)
	}
	interviewAgent, err := interview.New(resumeModel, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build interview agent: %v", err)
	}
	presentationProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Presentation)
	if err != nil {
		log.Fatalf("configure presentation model: %v", err)
	}
	presentationModel, err := openai.NewMulti(presentationProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure presentation fallbacks: %v", err)
	}
	presentationAgent, err := presentation.New(presentationModel, braveSearch, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build presentation agent: %v", err)
	}
	researchProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Research)
	if err != nil {
		log.Fatalf("configure research model: %v", err)
	}
	researchModel, err := openai.NewMulti(researchProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure research fallbacks: %v", err)
	}
	researchAgent, err := research.New(researchModel, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build research agent: %v", err)
	}
	spreadsheetProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Spreadsheet)
	if err != nil {
		log.Fatalf("configure spreadsheet model: %v", err)
	}
	spreadsheetModel, err := openai.NewMulti(spreadsheetProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure spreadsheet fallbacks: %v", err)
	}
	spreadsheetAgent, err := spreadsheet.New(spreadsheetModel, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build spreadsheet agent: %v", err)
	}
	expenseProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Expense)
	if err != nil {
		log.Fatalf("configure expense model: %v", err)
	}
	expenseModel, err := openai.NewMulti(expenseProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure expense fallbacks: %v", err)
	}
	expenseAgent, err := expense.New(expenseModel, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build expense agent: %v", err)
	}
	travelProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Travel)
	if err != nil {
		log.Fatalf("configure travel model: %v", err)
	}
	travelModel, err := openai.NewMulti(travelProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure travel fallbacks: %v", err)
	}
	trvlEndpoint := strings.TrimSpace(os.Getenv("TRVL_MCP_URL"))
	if trvlEndpoint == "" {
		trvlEndpoint = "https://trvl-production.up.railway.app/mcp"
	}
	travelAgent, err := travel.New(travelModel, agui.NewAGUIToolset(pending), travel.NewTRVL(trvlEndpoint, &http.Client{Timeout: 20 * time.Second}))
	if err != nil {
		log.Fatalf("build travel agent: %v", err)
	}
	fitnessProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Fitness)
	if err != nil {
		log.Fatalf("configure fitness model: %v", err)
	}
	fitnessModel, err := openai.NewMulti(fitnessProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure fitness fallbacks: %v", err)
	}
	fitnessActivities := fitnessdata.NewStore(d1)
	groceryLists := groceries.NewStoreWithArtifacts(d1, cloudflare.NewArtifactService(r2))
	defer func() { _ = groceryLists.Close() }()
	fitnessAgent, err := fitness.New(fitnessModel, fitnessActivities, braveSearch, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build fitness agent: %v", err)
	}
	groceryProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Grocery)
	if err != nil {
		log.Fatalf("configure grocery model: %v", err)
	}
	groceryModel, err := openai.NewMulti(groceryProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure grocery fallbacks: %v", err)
	}
	krogerEndpoint := strings.TrimSpace(os.Getenv("KROGER_MCP_URL"))
	if krogerEndpoint == "" {
		krogerEndpoint = "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
	}
	krogerClient := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint)
	webLoader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	groceryAgent, err := grocery.NewWithLibrary(groceryModel, krogerClient, braveSearch, webLoader, groceryLists, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build grocery agent: %v", err)
	}
	fitnessTaskAgent, err := fitness.NewTask(fitnessModel, fitnessActivities, braveSearch, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build wellness fitness task agent: %v", err)
	}
	groceryTaskAgent, err := grocery.NewTaskWithLibrary(groceryModel, krogerClient, braveSearch, webLoader, groceryLists, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build wellness grocery task agent: %v", err)
	}
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: fitnessModel}, fitnessTaskAgent, groceryTaskAgent, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build wellness agent: %v", err)
	}
	trendsProvider, err := providerpolicy.ResolveAgent(cfg.Providers, providerpolicy.Trends)
	if err != nil {
		log.Fatalf("configure trends model: %v", err)
	}
	trendsModel, err := openai.NewMulti(trendsProvider, availableProviders, nil, limiter)
	if err != nil {
		log.Fatalf("configure trends fallbacks: %v", err)
	}
	trendsBigQuery, err := trendsBigQueryClient(ctx)
	if err != nil {
		log.Fatalf("configure trends BigQuery client: %v", err)
	}
	trendsExecutor, err := trends.NewBigQueryExecutor(trendsBigQuery, "bigquery-public-data", "google_trends", trends.DefaultMaxBytesBilled, 30*time.Second)
	if err != nil {
		log.Fatalf("configure trends BigQuery executor: %v", err)
	}
	trendsGenerator, err := trends.NewGenerator(trendsModel)
	if err != nil {
		log.Fatalf("build trends generator agent: %v", err)
	}
	trendsAgent, err := trends.New(trendsModel, trendsGenerator, trendsExecutor, braveSearch, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build trends agent: %v", err)
	}
	oralboardsPhaseModels, err := oralboardsModels(ctx)
	if err != nil {
		log.Fatalf("configure oralboards models: %v", err)
	}
	corpusPath := strings.TrimSpace(os.Getenv("ORALBOARDS_CORPUS_PATH"))
	if corpusPath == "" {
		corpusPath = "assets/oralboards/search.sqlite"
	}
	oralboardsCorpus, err := oralboards.OpenCorpus(corpusPath)
	if err != nil {
		log.Fatalf("configure oralboards corpus: %v", err)
	}
	oralboardsAgent, err := oralboards.New(oralboardsPhaseModels, oralboardsCorpus, agui.NewAGUIToolset(pending))
	if err != nil {
		log.Fatalf("build oralboards agent: %v", err)
	}
	defer func() { _ = oralboardsCorpus.Close() }()

	specialists := bootstrap.Specialists{
		Travel:       bootstrap.Binding{Agent: travelAgent, StateDefaults: travel.StateDefaults},
		Grocery:      bootstrap.Binding{Agent: groceryAgent, StateDefaults: grocery.StateDefaults},
		Fitness:      bootstrap.Binding{Agent: fitnessAgent, StateDefaults: fitness.StateDefaults},
		Wellness:     bootstrap.Binding{Agent: wellnessAgent, StateDefaults: wellness.StateDefaults},
		Expense:      bootstrap.Binding{Agent: expenseAgent, StateDefaults: expense.StateDefaults},
		OralBoards:   bootstrap.Binding{Agent: oralboardsAgent, StateDefaults: oralboards.StateDefaults},
		Trends:       bootstrap.Binding{Agent: trendsAgent, StateDefaults: trends.StateDefaults},
		Resume:       bootstrap.Binding{Agent: resumeAgent, StateDefaults: resume.StateDefaults, Health: resumeHealth(resumeModel)},
		Jobs:         bootstrap.Binding{Agent: jobsAgent, StateDefaults: jobs.StateDefaults},
		Interview:    bootstrap.Binding{Agent: interviewAgent, StateDefaults: interview.StateDefaults},
		Research:     bootstrap.Binding{Agent: researchAgent, StateDefaults: research.StateDefaults},
		Spreadsheet:  bootstrap.Binding{Agent: spreadsheetAgent, StateDefaults: spreadsheet.StateDefaults},
		Presentation: bootstrap.Binding{Agent: presentationAgent, StateDefaults: presentation.StateDefaults},
	}
	registry, err := specialists.Registry()
	if err != nil {
		log.Fatalf("build agent registry: %v", err)
	}

	var verifier auth.TokenVerifier
	var clerkBackend clerk.Backend
	if cfg.ClerkSecret != "" {
		configured, clerkErr := clerk.NewBackend(common.NewHTTPClient(15*time.Second, 1<<20).Client, "", cfg.ClerkSecret)
		if clerkErr != nil {
			log.Fatalf("configure Clerk backend: %v", clerkErr)
		}
		clerkBackend = configured
	}
	if cfg.ClerkJWKS != "" {
		clerkVerifier, err := auth.NewClerkVerifier(cfg.ClerkJWKS, cfg.ClerkIssuer, "", nil)
		if err != nil {
			log.Fatalf("configure Clerk verifier: %v", err)
		}
		verifier = clerkVerifier
	}

	handler, err := New(cfg, Dependencies{
		Registry:     registry,
		Sessions:     sessions,
		Pending:      pending,
		Verifier:     verifier,
		D1:           d1,
		R2:           r2,
		Links:        telegram.NewLinkStore(d1, time.Now),
		Clerk:        clerkBackend,
		Fitness:      fitnessActivities,
		Groceries:    groceryLists,
		Shopping:     groceryLists,
		KrogerMCPURL: krogerEndpoint,
		Now:          time.Now,
	})
	if err != nil {
		log.Fatalf("build gateway: %v", err)
	}

	server := &http.Server{
		Addr:    ":" + cfg.HTTP.Port,
		Handler: observability.WrapSentry(handler),
		// Long enough that a slow client filling headers can't hold a
		// connection open indefinitely, short enough not to mask a hung
		// upstream. WriteTimeout is generous because AG-UI runs stream SSE
		// for the lifetime of one agent turn.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       120 * time.Second,
	}

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
	serveErr := server.ListenAndServe()
	stop()
	<-shutdownDone
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		// log.Fatalf exits before deferred flushes run, so report first.
		observability.CaptureError(context.Background(), serveErr)
		flushSentry()
		log.Fatalf("gateway server failed: %v", serveErr)
	}
}
