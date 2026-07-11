package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/cloudflare"
	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
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
		log.Printf("run: decode input failed: %v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
		return
	}

	entry, err := h.registry.Lookup(routeAgent(r.URL.Path))
	if err != nil {
		log.Printf("run: agent lookup failed for path=%s: %v", r.URL.Path, err)
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

	if entry.Forwarded != nil {
		result, handled, forwardedErr := entry.Forwarded.HandleForwarded(ctx, input.ForwardedProps)
		if handled {
			h.writeForwarded(w, input.ThreadID, input.RunID, result, forwardedErr)
			return
		}
	}

	sess, err := h.restoreSession(ctx, entry, userID, input.ThreadID)
	if err != nil {
		log.Printf("run: session restore failed: agent=%s thread=%s user=%s err=%v", entry.AppName, input.ThreadID, userID, err)
		writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
		return
	}

	flusher, ok := w.(http.Flusher)
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
	clientTools := clientToolsFromInput(input)
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

	rn, err := runner.New(runner.Config{AppName: entry.AppName, Agent: entry.Agent, SessionService: h.sessions, AutoCreateSession: true})
	if err != nil {
		log.Printf("run: runner creation failed: agent=%s thread=%s err=%v", entry.AppName, input.ThreadID, err)
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

	overlay := requestStateOverlay(r, entry.Route)
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
		log.Printf("run failed: agent=%s thread=%s user=%s run=%s err=%v", entry.AppName, input.ThreadID, userID, input.RunID, runErr)
		frame.write(sanitizeRunError(input.RunID, runErr))
		return
	}

	finished := &aguievents.RunFinishedEvent{BaseEvent: newBase(aguievents.EventTypeRunFinished), ThreadIDValue: input.ThreadID, RunIDValue: input.RunID}
	if converter.lastFinalText != "" {
		finished.Result = converter.lastFinalText
	}
	frame.write(finished)
}

func (h *runHandler) writeForwarded(w http.ResponseWriter, threadID, runID string, result any, runErr error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("forwarded: response writer does not support flushing")
		writeJSONError(w, http.StatusInternalServerError, "streaming_unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	frame := &sseWriter{w: w, flusher: flusher}
	frame.write(&aguievents.RunStartedEvent{BaseEvent: newBase(aguievents.EventTypeRunStarted), ThreadIDValue: threadID, RunIDValue: runID})
	if runErr != nil {
		log.Printf("forwarded run failed: thread=%s run=%s err=%v", threadID, runID, runErr)
		frame.write(sanitizeRunError(runID, runErr))
		return
	}
	frame.write(&aguievents.RunFinishedEvent{BaseEvent: newBase(aguievents.EventTypeRunFinished), ThreadIDValue: threadID, RunIDValue: runID, Result: result})
}

// restoreSession fetches the existing (app, user, thread) session or
// creates one seeded with the agent's declared state defaults.
func (h *runHandler) restoreSession(ctx context.Context, entry agentruntime.Entry, userID, threadID string) (session.Session, error) {
	response, err := h.sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	if err == nil {
		return response.Session, nil
	}
	if !errors.Is(err, cloudflare.ErrSessionNotFound) {
		log.Printf("restoreSession: get failed: app=%s user=%s thread=%s err=%v", entry.AppName, userID, threadID, err)
		return nil, err
	}
	created, err := h.sessions.Create(ctx, &session.CreateRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID, State: entry.StateDefaults})
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
