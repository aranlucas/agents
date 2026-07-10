// Command gateway is the single deployable Go ADK HTTP service: it mounts
// every registered agent's AG-UI routes behind Clerk auth (except the
// public /resume slice), persists sessions and pending client-tool calls in
// D1, and serves artifacts from R2. See AGENTS.md's Architecture section.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
	"github.com/aranlucas/agents/agents/internal/agents/expense"
	"github.com/aranlucas/agents/agents/internal/agents/fitness"
	"github.com/aranlucas/agents/agents/internal/agents/grocery"
	"github.com/aranlucas/agents/agents/internal/agents/presentation"
	"github.com/aranlucas/agents/agents/internal/agents/research"
	"github.com/aranlucas/agents/agents/internal/agents/resume"
	"github.com/aranlucas/agents/agents/internal/agents/spreadsheet"
	"github.com/aranlucas/agents/agents/internal/agents/travel"
	"github.com/aranlucas/agents/agents/internal/agui"
	"github.com/aranlucas/agents/agents/internal/auth"
	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"github.com/aranlucas/agents/agents/internal/config"
	"github.com/aranlucas/agents/agents/internal/observability"
	"github.com/aranlucas/agents/agents/internal/providers/openai"
	"github.com/aranlucas/agents/agents/internal/rate"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
)

const healthCheckTimeout = 3 * time.Second

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
	Registry *agentruntime.Registry
	Sessions session.Service
	Pending  agui.PendingTools
	Verifier auth.TokenVerifier
	D1       healthChecker
	R2       healthChecker
	Now      func() time.Time
}

// New composes the gateway's HTTP surface: per-agent AG-UI run, state, and
// capability routes registered from every agentruntime.Entry in
// deps.Registry, a root /health, Clerk auth (bypassed only for entries
// marked Public), and the configured browser-origin policy. It mounts the
// same shared agui.Handler and agui.StateHandler across every route — both
// resolve the target agent from the request path via registry.Lookup, so
// building one instance per entry would be redundant work, not additional
// isolation.
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

	runHandler := agui.Handler(deps.Registry, deps.Sessions, agui.WithPendingTools(deps.Pending))
	stateHandler := agui.StateHandler(deps.Registry, deps.Sessions)

	mux := http.NewServeMux()
	publicRoutes := map[string]bool{"/health": true}

	for _, entry := range deps.Registry.Entries() {
		base := "/" + entry.Route
		mux.Handle("POST "+base+"/agui", runHandler)
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

	mux.HandleFunc("GET /health", rootHealthHandler(deps))

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
	protected := auth.RequireIdentity(publicRoutes, mux, verifiers...)
	routed := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern == "" {
			mux.ServeHTTP(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})
	return auth.CORS(cfg.HTTP.Origins, routed), nil
}

// capabilitiesHandler advertises only the AG-UI features the Go runtime's
// agui.Handler actually implements (see internal/agui/handler.go and
// converter.go): SSE streaming, STATE_SNAPSHOT/STATE_DELTA, and reasoning
// message events. tools.supported is false because no agent built via this
// vertical slice attaches static or request-scoped client tools yet.
func capabilitiesHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"transport": map[string]any{"streaming": true},
		"state":     map[string]any{"snapshots": true, "deltas": true, "persistentState": true},
		"reasoning": map[string]any{"supported": true, "streaming": true},
		"tools":     map[string]any{"supported": true, "clientProvided": true},
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
		_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "agent": entry.AppName})
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
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  status,
			"service": "agents-gateway",
			"time":    deps.Now().UTC().Format(time.RFC3339),
			"checks":  checks,
		})
	}
}

// resumeProviderConfig selects the resume agent's inference provider: the
// same OpenRouter free-tier model (tencent/hy3:free) the Python resume
// agent used in agents/resume/src/resume_agent/agent.py's build_agent(),
// sharing OpenRouter's documented 20 RPM / 1000 RPD cap (AGENTS.md's Model
// Distribution table, "Light" tier).
func resumeProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["openrouter"]
	if !ok {
		return config.Provider{}, errors.New("OPENROUTER_API_KEY is required to configure the resume agent")
	}
	provider.Model = "tencent/hy3:free"
	provider.RequestsPerMinute = 20
	provider.RequestsPerDay = 1000
	return provider, nil
}

func presentationProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["groq"]
	if !ok {
		return config.Provider{}, errors.New("GROQ_API_KEY is required to configure the presentation agent")
	}
	provider.Model = "llama-3.3-70b-versatile"
	provider.RequestsPerMinute = 30
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral", "openrouter")
	return provider, nil
}

func researchProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["openrouter"]
	if !ok {
		return config.Provider{}, errors.New("OPENROUTER_API_KEY is required to configure the research agent")
	}
	provider.Model, provider.RequestsPerMinute, provider.RequestsPerDay = "tencent/hy3:free", 20, 1000
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral")
	return provider, nil
}

func spreadsheetProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["groq"]
	if !ok {
		return config.Provider{}, errors.New("GROQ_API_KEY is required to configure the spreadsheet agent")
	}
	provider.Model, provider.RequestsPerMinute = "llama-3.3-70b-versatile", 30
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral", "openrouter")
	return provider, nil
}

func expenseProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["openrouter"]
	if !ok {
		return config.Provider{}, errors.New("OPENROUTER_API_KEY is required to configure the expense agent")
	}
	provider.Model, provider.RequestsPerMinute, provider.RequestsPerDay = "tencent/hy3:free", 20, 1000
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral")
	return provider, nil
}

func travelProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["openrouter"]
	if !ok {
		return config.Provider{}, errors.New("OPENROUTER_API_KEY is required to configure the travel agent")
	}
	provider.Model, provider.RequestsPerMinute, provider.RequestsPerDay = "tencent/hy3:free", 20, 1000
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral")
	return provider, nil
}

func fitnessProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["groq"]
	if !ok {
		return config.Provider{}, errors.New("GROQ_API_KEY is required to configure the fitness agent")
	}
	provider.Model, provider.RequestsPerMinute = "llama-3.3-70b-versatile", 30
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral", "openrouter")
	return provider, nil
}

func groceryProviderConfig(cfg config.Config) (config.Provider, error) {
	provider, ok := cfg.Providers["nvidia"]
	if !ok {
		return config.Provider{}, errors.New("NVIDIA_NIM_API_KEY is required to configure the grocery agent")
	}
	provider.Model, provider.RequestsPerMinute = "nvidia/nemotron-3-super-120b-a12b", 20
	provider.Fallbacks = configuredFallbacks(cfg.Providers, "mistral", "openrouter")
	return provider, nil
}

func configuredFallbacks(providers map[string]config.Provider, names ...string) []string {
	result := make([]string, 0, len(names))
	for _, name := range names {
		if _, ok := providers[name]; ok {
			result = append(result, name)
		}
	}
	return result
}

func presentationProviderPolicies(providers map[string]config.Provider) map[string]config.Provider {
	result := make(map[string]config.Provider, len(providers))
	for name, provider := range providers {
		result[name] = provider
	}
	if provider, ok := result["mistral"]; ok {
		provider.Model, provider.RequestsPerMinute = "mistral-small-latest", 20
		result["mistral"] = provider
	}
	if provider, ok := result["openrouter"]; ok {
		provider.Model, provider.RequestsPerMinute = "tencent/hy3:free", 20
		result["openrouter"] = provider
	}
	return result
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
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}

	d1, err := cloudflare.NewD1(cfg.Cloudflare, nil)
	if err != nil {
		log.Fatalf("configure D1: %v", err)
	}
	if err := d1.RunMigrations(context.Background()); err != nil {
		// Non-fatal: an unreachable or misconfigured D1 is the same failure
		// mode rootHealthHandler and agentHealthHandler already tolerate at
		// runtime (they report "degraded"/503 rather than crash — see
		// rootHealthHandler above). Crashing here instead would be
		// inconsistent with that design and would also mean the process
		// never binds a port for a foundation image smoke-tested with fake
		// Cloudflare credentials (agents/scripts/smoke-image.sh) or a local
		// dev container without live D1 access. Session persistence will
		// fail loudly downstream (D1 calls return errors) if the schema is
		// genuinely missing, so this does not silently mask a broken schema.
		log.Printf("warning: apply D1 migrations: %v (continuing; D1 reads/writes will fail until this is resolved)", err)
	}
	r2, err := cloudflare.NewR2(cfg.Cloudflare)
	if err != nil {
		log.Fatalf("configure R2: %v", err)
	}

	sessions := cloudflare.NewSessionService(d1, time.Now)
	pending := agui.NewPendingStore(d1, time.Now)
	limiter := rate.NewProviderLimiter(d1, time.Now)

	resumeProvider, err := resumeProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure resume model: %v", err)
	}
	resumeModel := openai.New(resumeProvider, nil, limiter)
	resumeAgent, err := resume.New(resumeModel)
	if err != nil {
		log.Fatalf("build resume agent: %v", err)
	}
	presentationProvider, err := presentationProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure presentation model: %v", err)
	}
	presentationModel, err := openai.NewMulti(presentationProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure presentation fallbacks: %v", err)
	}
	presentationAgent, err := presentation.New(presentationModel, agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build presentation agent: %v", err)
	}
	researchProvider, err := researchProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure research model: %v", err)
	}
	researchModel, err := openai.NewMulti(researchProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure research fallbacks: %v", err)
	}
	researchAgent, err := research.New(researchModel, agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build research agent: %v", err)
	}
	spreadsheetProvider, err := spreadsheetProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure spreadsheet model: %v", err)
	}
	spreadsheetModel, err := openai.NewMulti(spreadsheetProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure spreadsheet fallbacks: %v", err)
	}
	spreadsheetAgent, err := spreadsheet.New(spreadsheetModel, agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build spreadsheet agent: %v", err)
	}
	expenseProvider, err := expenseProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure expense model: %v", err)
	}
	expenseModel, err := openai.NewMulti(expenseProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure expense fallbacks: %v", err)
	}
	expenseAgent, err := expense.New(expenseModel, agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build expense agent: %v", err)
	}
	travelProvider, err := travelProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure travel model: %v", err)
	}
	travelModel, err := openai.NewMulti(travelProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure travel fallbacks: %v", err)
	}
	trvlEndpoint := strings.TrimSpace(os.Getenv("TRVL_MCP_URL"))
	if trvlEndpoint == "" {
		trvlEndpoint = "https://trvl-production.up.railway.app/mcp"
	}
	travelAgent, err := travel.New(travelModel, agui.NewRequestScopedClientToolset(pending), travel.NewTRVL(trvlEndpoint, &http.Client{Timeout: 20 * time.Second}))
	if err != nil {
		log.Fatalf("build travel agent: %v", err)
	}
	var braveSearch *common.BraveSearch
	if braveKey := strings.TrimSpace(os.Getenv("BRAVE_API_KEY")); braveKey != "" {
		braveSearch, err = common.NewBraveSearch(common.NewHTTPClient(15*time.Second, 4<<20).Client, "https://api.search.brave.com/res/v1/web/search", braveKey, 10)
		if err != nil {
			log.Fatalf("configure Brave search: %v", err)
		}
	}
	fitnessProvider, err := fitnessProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure fitness model: %v", err)
	}
	fitnessModel, err := openai.NewMulti(fitnessProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure fitness fallbacks: %v", err)
	}
	fitnessAgent, err := fitness.New(fitnessModel, fitness.NewStrava(common.NewHTTPClient(30*time.Second, 8<<20).Client, "https://www.strava.com/api/v3/athlete/activities"), braveSearch, agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build fitness agent: %v", err)
	}
	groceryProvider, err := groceryProviderConfig(cfg)
	if err != nil {
		log.Fatalf("configure grocery model: %v", err)
	}
	groceryModel, err := openai.NewMulti(groceryProvider, presentationProviderPolicies(cfg.Providers), nil, limiter)
	if err != nil {
		log.Fatalf("configure grocery fallbacks: %v", err)
	}
	krogerEndpoint := strings.TrimSpace(os.Getenv("KROGER_MCP_URL"))
	if krogerEndpoint == "" {
		krogerEndpoint = "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
	}
	groceryAgent, err := grocery.New(groceryModel, grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint), braveSearch, common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000), agui.NewRequestScopedClientToolset(pending))
	if err != nil {
		log.Fatalf("build grocery agent: %v", err)
	}

	registry, err := agentruntime.NewRegistry(
		agentruntime.Entry{Route: "resume", AppName: resume.AppName, Agent: resumeAgent, Public: true, Timeout: 2 * time.Minute, Health: resumeHealth(resumeModel)},
		agentruntime.Entry{Route: "presentation", AppName: presentation.AppName, Agent: presentationAgent, StateDefaults: presentation.StateDefaults(), Timeout: 2 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "research", AppName: research.AppName, Agent: researchAgent, StateDefaults: research.StateDefaults(), Timeout: 3 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "spreadsheet", AppName: spreadsheet.AppName, Agent: spreadsheetAgent, StateDefaults: spreadsheet.StateDefaults(), Timeout: 2 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "expense", AppName: expense.AppName, Agent: expenseAgent, StateDefaults: expense.StateDefaults(), Timeout: 2 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "travel", AppName: travel.AppName, Agent: travelAgent, StateDefaults: travel.StateDefaults(), Timeout: 3 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "fitness", AppName: fitness.AppName, Agent: fitnessAgent, StateDefaults: fitness.StateDefaults(), Timeout: 3 * time.Minute, Health: func(context.Context) error { return nil }},
		agentruntime.Entry{Route: "grocery", AppName: grocery.AppName, Agent: groceryAgent, StateDefaults: grocery.StateDefaults(), Timeout: 3 * time.Minute, Health: func(context.Context) error { return nil }},
	)
	if err != nil {
		log.Fatalf("build agent registry: %v", err)
	}

	var verifier auth.TokenVerifier
	if cfg.ClerkJWKS != "" {
		clerkVerifier, err := auth.NewClerkVerifier(cfg.ClerkJWKS, cfg.ClerkIssuer, "", nil)
		if err != nil {
			log.Fatalf("configure Clerk verifier: %v", err)
		}
		verifier = clerkVerifier
	}

	handler, err := New(cfg, Dependencies{
		Registry: registry,
		Sessions: sessions,
		Pending:  pending,
		Verifier: verifier,
		D1:       d1,
		R2:       r2,
		Now:      time.Now,
	})
	if err != nil {
		log.Fatalf("build gateway: %v", err)
	}

	server := &http.Server{
		Addr:    ":" + cfg.HTTP.Port,
		Handler: observability.Wrap("agents-gateway", handler),
		// Long enough that a slow client filling headers can't hold a
		// connection open indefinitely, short enough not to mask a hung
		// upstream. WriteTimeout is generous because AG-UI runs stream SSE
		// for the lifetime of one agent turn.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("agents gateway listening on :%s", cfg.HTTP.Port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("gateway server failed: %v", err)
	}
}
