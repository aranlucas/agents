// Command telegram runs the Go-only Telegram long-poll worker and its health server.
package telegramworker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/aranlucas/agents/internal/bootstrap"
	"github.com/aranlucas/agents/internal/bravesearch"
	"github.com/aranlucas/agents/internal/catalog"
	"github.com/aranlucas/agents/internal/clerk"
	"github.com/aranlucas/agents/internal/cloudflare"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/expense"
	"github.com/aranlucas/agents/internal/fitness"
	"github.com/aranlucas/agents/internal/fitnessdata"
	"github.com/aranlucas/agents/internal/groceries"
	"github.com/aranlucas/agents/internal/grocery"
	"github.com/aranlucas/agents/internal/observability"
	"github.com/aranlucas/agents/internal/oralboards"
	"github.com/aranlucas/agents/internal/presentation"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"github.com/aranlucas/agents/internal/providers/openai"
	"github.com/aranlucas/agents/internal/rate"
	"github.com/aranlucas/agents/internal/research"
	"github.com/aranlucas/agents/internal/resume"
	"github.com/aranlucas/agents/internal/spreadsheet"
	"github.com/aranlucas/agents/internal/telegram"
	"github.com/aranlucas/agents/internal/travel"
	"github.com/aranlucas/agents/internal/trends"
	"github.com/aranlucas/agents/internal/wellness"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/agenttool"
)

func Run() {
	cfg, err := config.LoadTelegram(os.Getenv)
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	allowedChatIDs, err := parseChatIDs(os.Getenv("TELEGRAM_ALLOWED_CHAT_IDS"))
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	telemetryConfig := observability.Config{
		ServiceName: "agents-telegram", ServiceVersion: os.Getenv("RAILWAY_GIT_COMMIT_SHA"),
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
	limiter := rate.NewProviderLimiter(d1, time.Now)
	provider, err := providerpolicy.ResolveRequired(cfg.Providers, providerpolicy.Telegram())
	if err != nil {
		log.Fatal(err)
	}
	model := openai.New(provider, common.NewHTTPClient(180*time.Second, 32<<20).Client, limiter)
	search := buildSearch()
	krogerEndpoint := envDefault("KROGER_MCP_URL", "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp")
	kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint)
	loader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	fitnessActivities := fitnessdata.NewStore(d1)
	groceryLists := groceries.NewStoreWithArtifacts(d1, cloudflare.NewArtifactService(r2))
	defer func() { _ = groceryLists.Close() }()
	fitnessAgent, err := fitness.New(model, fitnessActivities, search)
	must(err)
	groceryAgent, err := grocery.NewWithLibrary(model, kroger, search, loader, groceryLists)
	must(err)
	fitnessTask, err := fitness.NewTask(model, fitnessActivities, search)
	must(err)
	groceryTask, err := grocery.NewTaskWithLibrary(model, kroger, search, loader, groceryLists)
	must(err)
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: model}, fitnessTask, groceryTask)
	must(err)
	corpus, err := oralboards.OpenCorpus(envDefault("ORALBOARDS_CORPUS_PATH", "assets/oralboards/search.sqlite"))
	must(err)
	defer func() { _ = corpus.Close() }()
	oralAgent, err := oralboards.New(oralboards.PhaseModels{CaseBuilder: model, Questioner: model, Evaluator: model, Scorer: model}, corpus)
	must(err)
	travelAgent, err := travel.New(model, travel.NewTRVL(envDefault("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp"), common.NewHTTPClient(20*time.Second, 8<<20).Client))
	must(err)
	trendGenerator, err := trends.NewGenerator(model)
	must(err)
	trendAgent, err := trends.New(model, trendGenerator, nil, search)
	must(err)
	resumeAgent, err := resume.New(model)
	must(err)
	presentationAgent, err := presentation.New(model, search)
	must(err)
	researchAgent, err := research.New(model)
	must(err)
	spreadsheetAgent, err := spreadsheet.New(model)
	must(err)
	expenseAgent, err := expense.New(model)
	must(err)
	bindings := bootstrap.Specialists{
		Travel: bootstrap.Binding{Agent: travelAgent}, Grocery: bootstrap.Binding{Agent: groceryAgent},
		Fitness: bootstrap.Binding{Agent: fitnessAgent}, Wellness: bootstrap.Binding{Agent: wellnessAgent},
		Expense: bootstrap.Binding{Agent: expenseAgent}, OralBoards: bootstrap.Binding{Agent: oralAgent},
		Trends: bootstrap.Binding{Agent: trendAgent}, Resume: bootstrap.Binding{Agent: resumeAgent},
		Research: bootstrap.Binding{Agent: researchAgent}, Spreadsheet: bootstrap.Binding{Agent: spreadsheetAgent},
		Presentation: bootstrap.Binding{Agent: presentationAgent},
	}
	specialists, err := bindings.Agents(catalog.Telegram())
	must(err)
	orchestrator, err := buildOrchestrator(model, specialists)
	must(err)
	specialists["orchestrator"] = orchestrator
	sessions := cloudflare.NewSessionService(d1, time.Now)
	executor, err := telegram.NewADKExecutor(sessions, cloudflare.NewArtifactService(r2), specialists)
	must(err)
	var backend clerk.Backend
	if cfg.ClerkSecret != "" {
		configured, backendErr := clerk.NewBackend(common.NewHTTPClient(15*time.Second, 1<<20).Client, "", cfg.ClerkSecret)
		must(backendErr)
		backend = configured
	}
	telegramConfig := telegram.Config{BotUsername: strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME")), AllowedChatIDs: allowedChatIDs, LinkBaseURL: strings.TrimSpace(os.Getenv("TELEGRAM_LINK_BASE_URL")), ConnectURL: strings.TrimSpace(os.Getenv("TELEGRAM_CONNECT_URL"))}
	bot, err := telegram.NewHTTPClient(common.NewHTTPClient(60*time.Second, 2<<20).Client, envDefault("TELEGRAM_API_BASE_URL", "https://api.telegram.org"), os.Getenv("TELEGRAM_BOT_TOKEN"))
	must(err)
	links := telegram.NewLinkStore(d1, time.Now)
	telegramRunner, err := telegram.NewRunner(bot, telegram.NewRouter(telegramConfig, backend), links, executor, telegramConfig, 180*time.Second)
	must(err)
	server := &http.Server{Addr: ":" + cfg.HTTP.Port, Handler: observability.WrapSentry(healthHandler(d1, r2)), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	go func() {
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Printf("health server: %v", serveErr)
			stop()
		}
	}()
	log.Printf("Telegram worker polling; health on %s", server.Addr)
	if err := telegramRunner.Run(ctx); err != nil {
		observability.CaptureError(context.Background(), err)
		log.Printf("Telegram polling stopped: %v", err)
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

func buildOrchestrator(model *openai.Model, specialists map[string]agent.Agent) (agent.Agent, error) {
	tools := make([]tool.Tool, 0, len(specialists))
	for _, spec := range catalog.Telegram() {
		// These authored specialists are chat-mode agents. Keeping the official
		// agenttool adapter makes each delegation a single tool result; ADK
		// SubAgents would instead use chat transfer semantics.
		tools = append(tools, agenttool.New(specialists[spec.Route], nil))
	}
	return llmagent.New(llmagent.Config{Name: telegram.OrchestratorAppName, Description: "Routes Telegram requests to exactly one specialist.", Model: model, Instruction: "Choose exactly one specialist tool for the request. Respect current sender credential flags. Return a concise Telegram-friendly answer; never call multiple specialists.", Tools: tools})
}

func buildSearch() *bravesearch.Client {
	key := strings.TrimSpace(os.Getenv("BRAVE_API_KEY"))
	if key == "" {
		return nil
	}
	result, err := bravesearch.New(common.NewHTTPClient(15*time.Second, 4<<20).Client, "https://api.search.brave.com/res/v1/web/search", key, 10)
	must(err)
	return result
}

func parseChatIDs(raw string) ([]int64, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var result []int64
	for value := range strings.SplitSeq(raw, ",") {
		value = strings.TrimSpace(value)
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed == 0 {
			return nil, fmt.Errorf("TELEGRAM_ALLOWED_CHAT_IDS contains invalid chat ID %q", value)
		}
		result = append(result, parsed)
	}
	return result, nil
}

func envDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

type healthResponse struct {
	Status  string            `json:"status"`
	Service string            `json:"service"`
	Checks  map[string]string `json:"checks,omitempty"`
}

func healthHandler(d1, r2 common.HealthChecker) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) {
		if err := common.WriteJSON(w, http.StatusOK, healthResponse{Status: "ok", Service: "agents-telegram"}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	})
	ready := func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		checks := common.ReadyChecks(ctx, map[string]common.HealthChecker{"d1": d1, "r2": r2})
		status, code := "ok", http.StatusOK
		if checks["d1"] != "ok" || checks["r2"] != "ok" {
			status, code = "degraded", http.StatusServiceUnavailable
		}
		if err := common.WriteJSON(w, code, healthResponse{Status: status, Service: "agents-telegram", Checks: checks}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	}
	mux.HandleFunc("GET /ready", ready)
	mux.HandleFunc("GET /health", ready)
	return mux
}
