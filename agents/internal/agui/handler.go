package agui

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/encoding/sse"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
)

// Option configures an ADKHandler.
type Option func(*handlerConfig)

type handlerConfig struct {
	pending PendingTools
	ids     events.IDGenerator
}

// WithPendingTools wires the D1-backed pending client-tool store used to
// resolve tool-result messages that resume a client tool call.
func WithPendingTools(pending PendingTools) Option {
	return func(c *handlerConfig) { c.pending = pending }
}

// WithIDGenerator overrides the AG-UI message/tool-call ID generator.
// Production defaults to events.NewDefaultIDGenerator(); tests inject a
// deterministic generator so golden SSE fixtures are reproducible.
func WithIDGenerator(ids events.IDGenerator) Option {
	return func(c *handlerConfig) { c.ids = ids }
}

// ADKHandler binds one ADK agent and session service to an AG-UI HTTP
// endpoint. The runner is built once at construction rather than once per
// request.
type ADKHandler struct {
	entry    agentruntime.Entry
	runner   *runner.Runner
	sessions session.Service
	pending  PendingTools
	ids      events.IDGenerator
}

// NewEntryHandler creates one AG-UI handler from the gateway's complete
// runtime metadata.
func NewEntryHandler(entry agentruntime.Entry, sessions session.Service, opts ...Option) (*ADKHandler, error) {
	if sessions == nil {
		return nil, fmt.Errorf("session service is required")
	}
	registry, err := agentruntime.NewRegistry(entry)
	if err != nil {
		return nil, err
	}
	entry, err = registry.Lookup(entry.Route)
	if err != nil {
		return nil, err
	}
	rn, err := runner.New(runner.Config{AppName: entry.AppName, Agent: entry.Agent, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		return nil, fmt.Errorf("create ADK runner: %w", err)
	}
	cfg := &handlerConfig{ids: events.NewDefaultIDGenerator()}
	for _, opt := range opts {
		opt(cfg)
	}
	return &ADKHandler{entry: entry, runner: rn, sessions: sessions, pending: cfg.pending, ids: cfg.ids}, nil
}

func (h *ADKHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	input, err := decodeRunInput(r.Body)
	if err != nil {
		log.Printf("run: decode input failed: %v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
		return
	}

	entry := h.entry

	identity, ok := auth.FromContext(r.Context())
	if !ok {
		identity = auth.Identity{UserID: "anonymous", Public: true}
	}
	userID := effectiveUserID(identity, input.ThreadID)

	ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout)
	defer cancel()

	sess, err := h.restoreSession(ctx, entry, userID, input.ThreadID)
	if err != nil {
		log.Printf("run: session restore failed: agent=%s thread=%s user=%s err=%v", entry.AppName, input.ThreadID, userID, err)
		writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
		return
	}

	_, ok = w.(http.Flusher)
	if !ok {
		log.Printf("run: response writer does not support flushing")
		writeJSONError(w, http.StatusInternalServerError, "streaming_unsupported")
		return
	}

	scope := ToolScope{AppName: entry.AppName, UserID: userID, ThreadID: input.ThreadID}
	content, err := runContent(ctx, input, identity, h.pending, scope)
	if err != nil {
		log.Printf("run: content conversion failed: agent=%s thread=%s user=%s err=%v", entry.AppName, input.ThreadID, userID, err)
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
		return
	}

	// AG-UI client tools require a PendingTools store to persist the
	// call until a tool-result message resumes it; without one, a
	// request that declares tools would silently run without them.
	clientTools := input.Tools
	if len(clientTools) > 0 && h.pending == nil {
		log.Printf("run: client tools declared but pending store unavailable: agent=%s thread=%s", entry.AppName, input.ThreadID)
		writeJSONError(w, http.StatusBadRequest, "client_tools_unsupported")
		return
	}
	clientToolNames := make(map[string]bool, len(clientTools))
	for _, definition := range clientTools {
		clientToolNames[definition.Name] = true
	}
	// Encode client tools before any header is written: json.Marshal
	// failing here must still produce a normal 4xx, which is impossible
	// once the SSE response has started.
	var clientToolsJSON string
	if len(clientTools) > 0 {
		encoded, err := json.Marshal(clientTools)
		if err != nil {
			log.Printf("run: client tools encode failed: agent=%s thread=%s err=%v", entry.AppName, input.ThreadID, err)
			writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
			return
		}
		clientToolsJSON = string(encoded)
	}
	snapshot, err := persistentSnapshot(sess.State())
	if err != nil {
		log.Printf("run: session state encode failed: agent=%s thread=%s err=%v", entry.AppName, input.ThreadID, err)
		writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	frame := sse.NewSSEWriter()
	_ = frame.WriteEvent(ctx, w, events.NewRunStartedEvent(input.ThreadID, input.RunID))

	_ = frame.WriteEvent(ctx, w, events.NewStateSnapshotEvent(snapshot))

	overlay := requestStateOverlay(r, entry.Route)
	if clientToolsJSON != "" {
		// Overlaid via runner.WithStateDelta, which lands on the session
		// before the agent's Toolsets are resolved for this invocation
		// (see AGUIToolset in client_tools.go) — this is
		// how the request's AG-UI tool declarations reach the running
		// agent as callable tools.
		if overlay == nil {
			overlay = make(map[string]any)
		}
		overlay[ClientToolsStateKey] = clientToolsJSON
	}
	var runOpts []runner.RunOption
	if overlay != nil {
		runOpts = append(runOpts, runner.WithStateDelta(overlay))
	}

	converter := newStreamConverter(ctx, h.ids, snapshot, h.pending, scope, clientToolNames)
	var runErr error
	for event, evErr := range h.runner.Run(ctx, userID, input.ThreadID, content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}, runOpts...) {
		if evErr != nil {
			runErr = evErr
			break
		}
		for _, converted := range converter.Convert(event) {
			_ = frame.WriteEvent(ctx, w, converted)
		}
	}
	// Runner implementations may stop iteration when their context expires
	// without yielding the context error. Treat an expired execution context as
	// the run failure so every started stream still receives a terminal event.
	if runErr == nil {
		runErr = ctx.Err()
	}

	if runErr != nil {
		// SSE encoding checks ctx.Err before it writes. The per-entry execution
		// context is intentionally canceled on timeout, so use a non-cancelable
		// derivative for the best-effort terminal flush and RUN_ERROR frame.
		// This does not extend agent execution; it only closes the protocol stream.
		terminalCtx := context.WithoutCancel(ctx)
		for _, converted := range converter.Flush() {
			_ = frame.WriteEvent(terminalCtx, w, converted)
		}
		log.Printf("run failed: agent=%s thread=%s user=%s run=%s err=%v", entry.AppName, input.ThreadID, userID, input.RunID, runErr)
		_ = frame.WriteEvent(terminalCtx, w, sanitizeRunError(input.RunID, runErr))
		return
	}

	finished := events.NewRunFinishedEvent(input.ThreadID, input.RunID)
	if converter.lastFinalText != "" {
		finished.Result = converter.lastFinalText
	}
	_ = frame.WriteEvent(ctx, w, finished)
}

// restoreSession fetches the existing (app, user, thread) session or
// creates one seeded with the agent's declared state defaults. It depends
// only on session.Service's Get/Create methods — mirroring
// runner.Runner.getOrCreateSession's own convention of treating any Get
// failure as "no session yet" rather than checking for a specific error —
// since session.Service documents no not-found contract to distinguish a
// missing session from a backend failure. Unlike the runner's internal
// getOrCreateSession, Create here must seed entry.StateDefaults, so this
// can't just rely on runner.Config.AutoCreateSession.
func (h *ADKHandler) restoreSession(ctx context.Context, entry agentruntime.Entry, userID, threadID string) (session.Session, error) {
	response, err := h.sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	if err == nil {
		return response.Session, nil
	}
	created, err := h.sessions.Create(ctx, &session.CreateRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID, State: entry.StateDefaults()})
	if err != nil {
		log.Printf("restoreSession: create failed: app=%s user=%s thread=%s err=%v", entry.AppName, userID, threadID, err)
		return nil, err
	}
	return created.Session, nil
}

// effectiveUserID returns the D1 session-key user ID. The verified Clerk
// subject is used when present; a public (e.g. /resume) request never trusts
// a client-supplied identity and instead derives a stable per-thread
// anonymous ID so unrelated public callers never collide on the same D1 row.
func effectiveUserID(identity auth.Identity, threadID string) string {
	if !identity.Public && strings.TrimSpace(identity.UserID) != "" {
		return identity.UserID
	}
	return "anon:" + threadID
}

// routeAgent extracts the mounted route prefix for the shared state handler.
func routeAgent(path string) string {
	trimmed := strings.Trim(path, "/")
	segments := strings.SplitN(trimmed, "/", 2)
	return segments[0]
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}
