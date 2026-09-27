// Command telegram runs the Go-only Telegram long-poll worker and its health server.
package telegramworker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aranlucas/agents/internal/app"
	"github.com/aranlucas/agents/internal/catalog"
	"github.com/aranlucas/agents/internal/clerk"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/observability"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"github.com/aranlucas/agents/internal/providers/openai"
	"github.com/aranlucas/agents/internal/telegram"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/agenttool"
)

// Run polls Telegram until ctx is canceled. It shares the gateway's database
// file, so it must run in the same container (and volume) as the gateway.
func Run(ctx context.Context) error {
	cfg, err := config.LoadTelegram(os.Getenv)
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	if err := app.ValidateProviders(cfg.Providers); err != nil {
		return fmt.Errorf("validate model providers: %w", err)
	}
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	flushSentry, err := observability.SetupSentry(observability.Config{
		ServiceName: "agents-telegram", ServiceVersion: cfg.Version,
		Environment: string(cfg.Environment), DSN: cfg.SentryDSN,
	})
	if err != nil {
		return fmt.Errorf("configure Sentry: %w", err)
	}
	defer flushSentry()
	rt, err := app.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = rt.Close() }()

	built, err := app.BuildSpecialists(ctx, rt)
	if err != nil {
		return err
	}
	defer func() { _ = built.Close() }()
	specialists, err := built.Agents(catalog.Telegram())
	if err != nil {
		return err
	}
	provider, err := providerpolicy.ResolveRequired(cfg.Providers, providerpolicy.Telegram())
	if err != nil {
		return err
	}
	orchestrator, err := buildOrchestrator(openai.New(provider, rt.ModelHTTP, rt.Limiter), specialists)
	if err != nil {
		return err
	}
	specialists["orchestrator"] = orchestrator
	executor, err := telegram.NewADKExecutor(rt.Sessions, rt.Artifacts, specialists)
	if err != nil {
		return err
	}
	var backend clerk.Backend
	if cfg.ClerkSecret != "" {
		if backend, err = clerk.NewBackend(common.NewHTTPClient(15*time.Second, 1<<20).Client, "", cfg.ClerkSecret); err != nil {
			return err
		}
	}
	telegramConfig := telegram.Config{BotUsername: cfg.Telegram.BotUsername, AllowedChatIDs: cfg.Telegram.AllowedChatIDs, LinkBaseURL: cfg.Telegram.LinkBaseURL, ConnectURL: cfg.Telegram.ConnectURL}
	bot, err := telegram.NewHTTPClient(common.NewHTTPClient(60*time.Second, 2<<20).Client, cfg.Telegram.APIBaseURL, cfg.Telegram.BotToken)
	if err != nil {
		return err
	}
	telegramRunner, err := telegram.NewRunner(bot, telegram.NewRouter(telegramConfig, backend), rt.Links, executor, telegramConfig, 180*time.Second)
	if err != nil {
		return err
	}
	server := &http.Server{Addr: ":" + cfg.HTTP.Port, Handler: observability.WrapSentry(healthHandler(rt.DB)), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	go func() {
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Printf("health server: %v", serveErr)
			stop()
		}
	}()
	log.Printf("Telegram worker polling; health on %s", server.Addr)
	runErr := telegramRunner.Run(ctx)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	if runErr != nil && !errors.Is(runErr, context.Canceled) {
		observability.CaptureError(context.Background(), runErr)
		return fmt.Errorf("telegram polling stopped: %w", runErr)
	}
	return nil
}

func buildOrchestrator(m model.LLM, specialists map[string]agent.Agent) (agent.Agent, error) {
	tools := make([]tool.Tool, 0, len(specialists))
	for _, spec := range catalog.Telegram() {
		// These authored specialists are chat-mode agents. Keeping the official
		// agenttool adapter makes each delegation a single tool result; ADK
		// SubAgents would instead use chat transfer semantics.
		tools = append(tools, agenttool.New(specialists[spec.Route], nil))
	}
	return llmagent.New(llmagent.Config{Name: telegram.OrchestratorAppName, Description: "Routes Telegram requests to exactly one specialist.", Model: m, Instruction: "Choose exactly one specialist tool for the request. Respect current sender credential flags. Return a concise Telegram-friendly answer; never call multiple specialists.", Tools: tools})
}

type healthResponse struct {
	Status  string            `json:"status"`
	Service string            `json:"service"`
	Checks  map[string]string `json:"checks,omitempty"`
}

func healthHandler(database common.HealthChecker) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) {
		if err := common.WriteJSON(w, http.StatusOK, healthResponse{Status: "ok", Service: "agents-telegram"}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	})
	ready := func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		checks := common.ReadyChecks(ctx, map[string]common.HealthChecker{"database": database})
		status, code := "ok", http.StatusOK
		if checks["database"] != "ok" {
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
