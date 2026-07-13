// Command telegram runs the Go-only Telegram long-poll worker and its health server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"agents/excalidraw/agent"
	"agents/expense/agent"
	"agents/fitness/agent"
	"agents/grocery/agent"
	"agents/internal/agui"
	"agents/internal/clerk"
	"agents/internal/cloudflare"
	"agents/internal/common"
	"agents/internal/config"
	"agents/internal/fitnessdata"
	"agents/internal/providers/openai"
	"agents/internal/rate"
	"agents/internal/telegram"
	"agents/oralboards/agent"
	"agents/presentation/agent"
	"agents/research/agent"
	"agents/resume/agent"
	"agents/spreadsheet/agent"
	"agents/travel/agent"
	"agents/trends/agent"
	"agents/wellness/agent"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/agenttool"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	d1, err := cloudflare.NewD1(cfg.Cloudflare, nil)
	if err != nil {
		log.Fatalf("configure D1: %v", err)
	}
	if err := d1.RunMigrations(ctx); err != nil {
		log.Printf("warning: apply D1 migrations: %v", err)
	}
	r2, err := cloudflare.NewR2(cfg.Cloudflare)
	if err != nil {
		log.Fatalf("configure R2: %v", err)
	}
	limiter := rate.NewProviderLimiter(d1, time.Now)
	provider, ok := cfg.Providers["mistral"]
	if !ok {
		log.Fatal("MISTRAL_API_KEY is required for Telegram")
	}
	provider.Model, provider.RequestsPerMinute = "mistral-medium-latest", 20
	model := openai.New(provider, common.NewHTTPClient(180*time.Second, 32<<20).Client, limiter)
	search := buildSearch()
	krogerEndpoint := envDefault("KROGER_MCP_URL", "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp")
	kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint)
	loader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	fitnessActivities := fitnessdata.NewStore(d1)
	fitnessAgent, err := fitness.New(model, fitnessActivities, search)
	must(err)
	groceryAgent, err := grocery.New(model, kroger, search, loader)
	must(err)
	fitnessTask, err := fitness.NewTask(model, fitnessActivities, search)
	must(err)
	groceryTask, err := grocery.NewTask(model, kroger, search, loader)
	must(err)
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: model}, fitnessTask, groceryTask)
	must(err)
	corpus, err := oralboards.OpenCorpus(envDefault("ORALBOARDS_CORPUS_PATH", "assets/oralboards/search.sqlite"))
	must(err)
	defer func() { _ = corpus.Close() }()
	oralAgent, err := oralboards.New(oralboards.PhaseModels{CaseBuilder: model, Questioner: model, Evaluator: model, Scorer: model}, corpus)
	must(err)
	excalBridge, err := agui.NewMCPApps([]agui.MCPAppsServer{{URL: envDefault("EXCALIDRAW_MCP_URL", "https://mcp.excalidraw.com/mcp"), ServerID: "excalidraw"}}, common.NewHTTPClient(30*time.Second, 8<<20).Client)
	must(err)
	excalAgent, err := excalidraw.New(model, excalBridge)
	must(err)
	travelAgent, err := travel.New(model, travel.NewTRVL(envDefault("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp"), common.NewHTTPClient(20*time.Second, 8<<20).Client))
	must(err)
	trendGenerator, err := trends.NewGenerator(model)
	must(err)
	trendAgent, err := trends.New(model, trendGenerator, nil, search, nil)
	must(err)
	resumeAgent, err := resume.New(model)
	must(err)
	presentationAgent, err := presentation.New(model)
	must(err)
	researchAgent, err := research.New(model)
	must(err)
	spreadsheetAgent, err := spreadsheet.New(model)
	must(err)
	expenseAgent, err := expense.New(model)
	must(err)
	specialists := map[string]agent.Agent{"excalidraw": excalAgent, "travel": travelAgent, "trends": trendAgent, "grocery": groceryAgent, "fitness": fitnessAgent, "wellness": wellnessAgent, "expense": expenseAgent, "oralboards": oralAgent, "presentation": presentationAgent, "research": researchAgent, "spreadsheet": spreadsheetAgent, "resume": resumeAgent}
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
	telegramConfig := telegram.Config{BotUsername: strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME")), AllowedChatIDs: parseChatIDs(os.Getenv("TELEGRAM_ALLOWED_CHAT_IDS")), LinkBaseURL: strings.TrimSpace(os.Getenv("TELEGRAM_LINK_BASE_URL")), ConnectURL: strings.TrimSpace(os.Getenv("TELEGRAM_CONNECT_URL"))}
	bot, err := telegram.NewHTTPClient(common.NewHTTPClient(60*time.Second, 2<<20).Client, envDefault("TELEGRAM_API_BASE_URL", "https://api.telegram.org"), os.Getenv("TELEGRAM_BOT_TOKEN"))
	must(err)
	links := telegram.NewLinkStore(d1, time.Now)
	telegramRunner, err := telegram.NewRunner(bot, telegram.NewRouter(telegramConfig, backend), links, executor, telegramConfig, 180*time.Second)
	must(err)
	server := &http.Server{Addr: ":" + envDefault("PORT", "8080"), Handler: healthHandler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	go func() {
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Printf("health server: %v", serveErr)
			stop()
		}
	}()
	log.Printf("Telegram worker polling; health on %s", server.Addr)
	if err := telegramRunner.Run(ctx); err != nil {
		log.Printf("Telegram polling stopped: %v", err)
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

func buildOrchestrator(model *openai.Model, specialists map[string]agent.Agent) (agent.Agent, error) {
	tools := make([]tool.Tool, 0, len(specialists))
	for _, name := range []string{"excalidraw", "travel", "trends", "grocery", "fitness", "wellness", "expense", "oralboards", "presentation", "research", "spreadsheet", "resume"} {
		tools = append(tools, agenttool.New(specialists[name], nil))
	}
	return llmagent.New(llmagent.Config{Name: telegram.OrchestratorAppName, Description: "Routes Telegram requests to exactly one specialist.", Model: model, Instruction: "Choose exactly one specialist tool for the request. Respect current sender credential flags. Return a concise Telegram-friendly answer; never call multiple specialists.", Tools: tools})
}

func buildSearch() *common.BraveSearch {
	key := strings.TrimSpace(os.Getenv("BRAVE_API_KEY"))
	if key == "" {
		return nil
	}
	result, err := common.NewBraveSearch(common.NewHTTPClient(15*time.Second, 4<<20).Client, "https://api.search.brave.com/res/v1/web/search", key, 10)
	must(err)
	return result
}

func parseChatIDs(raw string) []int64 {
	var result []int64
	for value := range strings.SplitSeq(raw, ",") {
		parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		if err == nil {
			result = append(result, parsed)
		}
	}
	return result
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

func healthHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	return mux
}
