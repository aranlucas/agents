package agui

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

// ADKAgentConfig configures the framework-independent AG-UI adapter. It
// mirrors the official ADK middleware's construction shape while retaining
// Go's explicit service wiring.
type ADKAgentConfig struct {
	Agent               agent.Agent
	AppName             string
	UserID              string
	SessionService      session.Service
	UseInMemoryServices bool
	ExecutionTimeout    time.Duration
	StateDefaults       map[string]any
	PendingTools        PendingTools
	Forwarded           agentruntime.ForwardedRequestHandler
	// Route is the mounted path segment (e.g. "grocery", "fitness"). Required:
	// requestStateOverlay switches on it to decide which provider-connected
	// flags (kroger_connected, strava_connected) a request carries, so a
	// silently-defaulted value would drop those flags without any signal —
	// exactly the bug this field exists to prevent recurring.
	Route string
}

// ADKAgent bridges one Google ADK agent to AG-UI independently of HTTP route
// composition. It implements http.Handler so it can be mounted directly or
// through AddADKHTTPHandler.
type ADKAgent struct {
	handler *ADKHandler
}

// NewADKAgent builds an AG-UI adapter. Production callers should provide a
// persistent SessionService; demos and tests may opt into ADK's in-memory
// service explicitly.
func NewADKAgent(cfg ADKAgentConfig) (*ADKAgent, error) {
	if cfg.Agent == nil {
		return nil, errors.New("ADK agent is required")
	}
	route := strings.TrimSpace(cfg.Route)
	if route == "" {
		return nil, errors.New("route is required")
	}
	if strings.TrimSpace(cfg.AppName) == "" {
		cfg.AppName = "adk-agent"
	}
	if cfg.SessionService == nil {
		if !cfg.UseInMemoryServices {
			return nil, errors.New("session service is required unless in-memory services are enabled")
		}
		cfg.SessionService = session.InMemoryService()
	}
	if cfg.ExecutionTimeout <= 0 {
		cfg.ExecutionTimeout = 10 * time.Minute
	}
	handler, err := NewEntryHandler(agentruntime.Entry{
		Route:         route,
		AppName:       cfg.AppName,
		Agent:         cfg.Agent,
		StateDefaults: cfg.StateDefaults,
		Timeout:       cfg.ExecutionTimeout,
		Forwarded:     cfg.Forwarded,
	}, cfg.SessionService, WithPendingTools(cfg.PendingTools), WithUserID(cfg.UserID))
	if err != nil {
		return nil, err
	}
	return &ADKAgent{handler: handler}, nil
}

func (a *ADKAgent) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if a == nil || a.handler == nil {
		http.Error(w, "AG-UI adapter is unavailable", http.StatusServiceUnavailable)
		return
	}
	a.handler.ServeHTTP(w, r)
}

// AddADKHTTPHandler mounts an ADKAgent on a ServeMux, analogous to the
// official middleware's add_adk_fastapi_endpoint helper.
func AddADKHTTPHandler(mux *http.ServeMux, adapter *ADKAgent, path string) error {
	if mux == nil {
		return errors.New("HTTP mux is required")
	}
	if adapter == nil || adapter.handler == nil {
		return errors.New("ADK agent adapter is required")
	}
	path = "/" + strings.Trim(strings.TrimSpace(path), "/")
	if path == "//" {
		path = "/"
	}
	mux.Handle("POST "+path, adapter)
	return nil
}
