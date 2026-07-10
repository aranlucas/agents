package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/auth"
	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
)

// Option configures a Handler built by Handler(...).
type Option func(*handlerConfig)

type handlerConfig struct {
	pending PendingTools
	ids     aguievents.IDGenerator
}

// WithPendingTools wires the D1-backed pending client-tool store used to
// resolve tool-result messages that resume a client tool call.
func WithPendingTools(pending PendingTools) Option {
	return func(c *handlerConfig) { c.pending = pending }
}

// WithIDGenerator overrides the AG-UI message/tool-call ID generator.
// Production defaults to aguievents.NewDefaultIDGenerator(); tests inject a
// deterministic generator so golden SSE fixtures are reproducible.
func WithIDGenerator(ids aguievents.IDGenerator) Option {
	return func(c *handlerConfig) { c.ids = ids }
}

// runHandler implements the POST /<agent>/agui endpoint: it converts one
// AG-UI RunAgentInput into an ADK-Go invocation and streams typed AG-UI SSE
// events back.
type runHandler struct {
	registry *agentruntime.Registry
	sessions session.Service
	pending  PendingTools
	ids      aguievents.IDGenerator
}

// Handler builds the AG-UI run endpoint for every agent mounted in
// registry, persisting session state through sessions.
func Handler(registry *agentruntime.Registry, sessions session.Service, opts ...Option) http.Handler {
	cfg := &handlerConfig{ids: aguievents.NewDefaultIDGenerator()}
	for _, opt := range opts {
		opt(cfg)
	}
	return &runHandler{registry: registry, sessions: sessions, pending: cfg.pending, ids: cfg.ids}
}

func (h *runHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	input, err := decodeRunInput(r.Body)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
		return
	}

	entry, err := h.registry.Lookup(routeAgent(r.URL.Path))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "unknown_agent")
		return
	}

	identity, ok := auth.FromContext(r.Context())
	if !ok {
		identity = auth.Identity{UserID: "anonymous", Public: true}
	}
	userID := effectiveUserID(identity, input.ThreadID)

	ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout)
	defer cancel()

	sess, err := h.restoreSession(ctx, entry, userID, input.ThreadID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming_unsupported")
		return
	}

	scope := ToolScope{AppName: entry.AppName, UserID: userID, ThreadID: input.ThreadID}
	content, err := runContent(ctx, input, identity, h.pending, scope)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
		return
	}

	// AG-UI client tools require a PendingTools store to persist the
	// call until a tool-result message resumes it; without one, a
	// request that declares tools would silently run without them.
	clientTools := clientToolsFromInput(input)
	if len(clientTools) > 0 && h.pending == nil {
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
			writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
			return
		}
		clientToolsJSON = string(encoded)
	}

	rn, err := runner.New(runner.Config{AppName: entry.AppName, Agent: entry.Agent, SessionService: h.sessions, AutoCreateSession: true})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "agent_unavailable")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	frame := &sseWriter{w: w, flusher: flusher}
	frame.write(&aguievents.RunStartedEvent{BaseEvent: newBase(aguievents.EventTypeRunStarted), ThreadIDValue: input.ThreadID, RunIDValue: input.RunID})

	snapshot := persistentSnapshot(sess.State())
	known := knownKeySet(snapshot)
	frame.write(&aguievents.StateSnapshotEvent{BaseEvent: newBase(aguievents.EventTypeStateSnapshot), Snapshot: snapshot})

	overlay := requestStateOverlay(r)
	if clientToolsJSON != "" {
		// Overlaid via runner.WithStateDelta, which lands on the session
		// before the agent's Toolsets are resolved for this invocation
		// (see RequestScopedClientToolset in client_tools.go) — this is
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

	converter := newStreamConverter(ctx, h.ids, known, h.pending, scope, clientToolNames)
	var runErr error
	for event, evErr := range rn.Run(ctx, userID, input.ThreadID, content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}, runOpts...) {
		if evErr != nil {
			runErr = evErr
			break
		}
		for _, converted := range converter.Convert(event) {
			frame.write(converted)
		}
	}

	if runErr != nil {
		for _, converted := range converter.Flush() {
			frame.write(converted)
		}
		frame.write(sanitizeRunError(input.RunID, runErr))
		return
	}

	finished := &aguievents.RunFinishedEvent{BaseEvent: newBase(aguievents.EventTypeRunFinished), ThreadIDValue: input.ThreadID, RunIDValue: input.RunID}
	if converter.lastFinalText != "" {
		finished.Result = converter.lastFinalText
	}
	frame.write(finished)
}

// restoreSession fetches the existing (app, user, thread) session or
// creates one seeded with the agent's declared state defaults.
func (h *runHandler) restoreSession(ctx context.Context, entry agentruntime.Entry, userID, threadID string) (session.Session, error) {
	response, err := h.sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	if err == nil {
		return response.Session, nil
	}
	if !errors.Is(err, cloudflare.ErrSessionNotFound) {
		return nil, err
	}
	created, err := h.sessions.Create(ctx, &session.CreateRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID, State: entry.StateDefaults})
	if err != nil {
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

// routeAgent extracts the mounted agent route prefix ("resume") from a
// request path such as "/resume/agui".
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

// sseWriter frames one AG-UI event as `data: <json>\n\n` and flushes it
// immediately so clients observe the run as it streams.
type sseWriter struct {
	w       io.Writer
	flusher http.Flusher
}

func (s *sseWriter) write(event aguievents.Event) {
	data, err := event.ToJSON()
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(s.w, "data: %s\n\n", data)
	s.flusher.Flush()
}
