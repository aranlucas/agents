package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/encoding/sse"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
)

// Option configures an ADKHandler.
type Option func(*handlerConfig)

type handlerConfig struct {
	pending   PendingTools
	ids       events.IDGenerator
	smoothing streamSmoothing
	active    *activeRuns
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

func withActiveRuns(active *activeRuns) Option {
	return func(c *handlerConfig) { c.active = active }
}

// streamSmoothing controls optional server-side pacing for AG-UI text
// streaming. The default is enabled and keeps short turns intact while
// splitting long turns into small chunks with a delay between each chunk.
type streamSmoothing struct {
	enabled       bool
	chunking      string
	charsPerChunk int
	chunkDelay    time.Duration
}

const (
	streamChunkingWord  = "word"
	streamChunkingLine  = "line"
	streamChunkingChar  = "char"
	sessionNameStateKey = "session_name"
)

var defaultStreamSmoothing = streamSmoothing{
	enabled:       true,
	chunking:      streamChunkingWord,
	charsPerChunk: 64,
	chunkDelay:    18 * time.Millisecond,
}

// WithStreamSmoothing overrides the converter's pacing behavior.
func WithStreamSmoothing(cfg streamSmoothing) Option {
	switch strings.ToLower(cfg.chunking) {
	case "", streamChunkingWord:
		cfg.chunking = streamChunkingWord
	case streamChunkingLine, streamChunkingChar:
		cfg.chunking = strings.ToLower(cfg.chunking)
	default:
		cfg.chunking = streamChunkingWord
	}
	if cfg.charsPerChunk <= 0 {
		cfg.charsPerChunk = defaultStreamSmoothing.charsPerChunk
	}
	if cfg.chunkDelay < 0 {
		cfg.chunkDelay = 0
	}
	return func(c *handlerConfig) { c.smoothing = cfg }
}

// WithTextStreamSmoothing is the public builder for text pacing settings.
// Use it from gateway/main.go (or other assembly points) to mirror ai-sdk-like
// behavior without leaking internals.
func WithTextStreamSmoothing(enabled bool, chunking string, chunkDelay time.Duration, charsPerChunk int) Option {
	return WithStreamSmoothing(streamSmoothing{enabled: enabled, chunking: chunking, charsPerChunk: charsPerChunk, chunkDelay: chunkDelay})
}

// ADKHandler binds one ADK agent and session service to an AG-UI HTTP
// endpoint. The runner is built once at construction rather than once per
// request.
type ADKHandler struct {
	entry     agentruntime.Entry
	runner    *runner.Runner
	sessions  session.Service
	stateless bool
	pending   PendingTools
	ids       events.IDGenerator
	smoothing streamSmoothing
	active    *activeRuns
}

// NewEntryHandler creates one AG-UI handler from the gateway's complete
// runtime metadata.
func NewEntryHandler(entry agentruntime.Entry, sessions session.Service, opts ...Option) (*ADKHandler, error) {
	return newEntryHandler(entry, sessions, false, opts...)
}

// NewStatelessEntryHandler creates the dedicated CopilotKit dynamic-
// suggestions endpoint. It uses the same ADK agent and request-scoped frontend
// tool injection as a normal run, but stores the synthetic suggestion session
// only in memory and deletes it as soon as the stream ends.
func NewStatelessEntryHandler(entry agentruntime.Entry, opts ...Option) (*ADKHandler, error) {
	return newEntryHandler(entry, session.InMemoryService(), true, opts...)
}

func newEntryHandler(entry agentruntime.Entry, sessions session.Service, stateless bool, opts ...Option) (*ADKHandler, error) {
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
	cfg := &handlerConfig{ids: events.NewDefaultIDGenerator(), smoothing: defaultStreamSmoothing}
	for _, opt := range opts {
		opt(cfg)
	}
	return &ADKHandler{
		entry: entry, runner: rn, sessions: sessions, stateless: stateless,
		pending: cfg.pending, ids: cfg.ids, smoothing: cfg.smoothing, active: cfg.active,
	}, nil
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
	var active *activeRunLease
	if h.active != nil {
		key := runKey{AgentRoute: entry.Route, UserID: userID, ThreadID: input.ThreadID}
		var started bool
		active, started = h.active.start(key, cancel)
		if !started {
			writeJSONErrorMessage(w, http.StatusInternalServerError, "Failed to run agent", "Thread already running")
			return
		}
		defer active.finish()
	}

	var sess session.Session
	if h.stateless {
		state := entry.StateDefaults()
		if state == nil {
			state = make(map[string]any)
		}
		created, createErr := h.sessions.Create(ctx, &session.CreateRequest{
			AppName: entry.AppName, UserID: userID, SessionID: input.ThreadID, State: state,
		})
		if createErr != nil {
			err = createErr
		} else {
			sess = created.Session
			defer func() {
				_ = h.sessions.Delete(context.WithoutCancel(ctx), &session.DeleteRequest{
					AppName: entry.AppName, UserID: userID, SessionID: input.ThreadID,
				})
			}()
		}
	} else {
		sess, err = h.restoreSession(ctx, entry, userID, input.ThreadID, input)
	}
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

	// A model run with AG-UI client tools requires a PendingTools store to
	// persist the call until a tool-result message resumes it; without one,
	// a request that declares tools would silently run without them.
	clientTools := input.Tools
	if content != nil && len(clientTools) > 0 && h.pending == nil {
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
	if content != nil && len(clientTools) > 0 {
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
	emit := func(writeCtx context.Context, event events.Event) {
		active.publish(event)
		_ = frame.WriteEvent(writeCtx, w, event)
	}
	emit(ctx, events.NewRunStartedEvent(input.ThreadID, input.RunID))

	emit(ctx, events.NewStateSnapshotEvent(snapshot))
	if content == nil {
		emit(ctx, events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, events.WithSuccessOutcome()))
		return
	}

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

	converter := newStreamConverter(ctx, h.ids, snapshot, h.pending, scope, clientToolNames, h.smoothing)
	var runErr error
	lastWasTextContent := false
runLoop:
	for event, evErr := range h.runner.Run(ctx, userID, input.ThreadID, content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}, runOpts...) {
		if evErr != nil {
			runErr = evErr
			break
		}
		for _, converted := range converter.Convert(event) {
			if h.smoothing.enabled && h.smoothing.chunkDelay > 0 && converted.Type() == events.EventTypeTextMessageContent && lastWasTextContent {
				select {
				case <-time.After(h.smoothing.chunkDelay):
				case <-ctx.Done():
					runErr = ctx.Err()
					break runLoop
				}
			}
			emit(ctx, converted)
			lastWasTextContent = converted.Type() == events.EventTypeTextMessageContent
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
			emit(terminalCtx, converted)
		}
		log.Printf("run failed: agent=%s thread=%s user=%s run=%s err=%v", entry.AppName, input.ThreadID, userID, input.RunID, runErr)
		emit(terminalCtx, sanitizeRunError(input.RunID, runErr))
		return
	}

	finished := events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, events.WithSuccessOutcome())
	if converter.lastFinalText != "" {
		finished.Result = converter.lastFinalText
	}
	emit(ctx, finished)
}

// restoreSession fetches the existing (app, user, thread) session or
// creates one seeded with the agent's declared state defaults. Only
// ErrSessionNotFound means creation is safe; storage outages and decode
// failures must propagate instead of being mistaken for a missing row.
// Create must seed entry.StateDefaults, so this cannot rely on the runner's
// automatic session creation.
func (h *ADKHandler) restoreSession(ctx context.Context, entry agentruntime.Entry, userID, threadID string, input *types.RunAgentInput) (session.Session, error) {
	response, err := h.sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	if err == nil {
		return response.Session, nil
	}
	if !errors.Is(err, ErrSessionNotFound) {
		return nil, fmt.Errorf("get session: %w", err)
	}
	name := sessionNameFromInput(input, entry.Route)
	state := entry.StateDefaults()
	if state == nil {
		state = make(map[string]any)
	}
	state[sessionNameStateKey] = name
	created, err := h.sessions.Create(ctx, &session.CreateRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID, State: state})
	if err != nil {
		log.Printf("restoreSession: create failed: app=%s user=%s thread=%s err=%v", entry.AppName, userID, threadID, err)
		return nil, err
	}
	return created.Session, nil
}

func sessionNameFromInput(input *types.RunAgentInput, route string) string {
	if name := firstUserMessage(input); name != "" {
		return truncateSessionName(name)
	}

	name := strings.ReplaceAll(strings.TrimSpace(route), "-", " ")
	if name == "" {
		return "New session"
	}
	return strings.ToUpper(name[:1]) + name[1:] + " session"
}

func truncateSessionName(value string) string {
	const maximum = 64
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= maximum {
		return string(runes)
	}
	return strings.TrimSpace(string(runes[:maximum-1])) + "…"
}

func firstUserMessage(input *types.RunAgentInput) string {
	for _, message := range input.Messages {
		if message.Role != types.RoleUser {
			continue
		}
		text, ok := message.ContentString()
		if !ok {
			continue
		}
		name := strings.Join(strings.Fields(text), " ")
		if name == "" || strings.EqualFold(name, "ready") {
			continue
		}
		return name
	}
	return ""
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

func writeJSONErrorMessage(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code, "message": message})
}
