package agui

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/auth"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/observability"
	"github.com/aranlucas/agents/internal/providererrors"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
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

	DefaultStreamCharsPerChunk = 64
	DefaultStreamChunkDelay    = 18 * time.Millisecond
	DefaultStreamChunking      = streamChunkingWord
)

var defaultStreamSmoothing = streamSmoothing{
	enabled:       true,
	chunking:      DefaultStreamChunking,
	charsPerChunk: DefaultStreamCharsPerChunk,
	chunkDelay:    DefaultStreamChunkDelay,
}

// StreamSmoothingFromEnv reads AGUI_STREAM_* overrides once. Invalid values
// keep the exported defaults.
func StreamSmoothingFromEnv() (enabled bool, chunking string, charsPerChunk int, chunkDelay time.Duration) {
	chunking = DefaultStreamChunking
	if rawChunking := strings.TrimSpace(strings.ToLower(os.Getenv("AGUI_STREAM_CHUNKING"))); rawChunking != "" {
		chunking = rawChunking
	}
	enabled = true
	if rawEnabled := strings.TrimSpace(os.Getenv("AGUI_STREAM_SMOOTHING")); rawEnabled != "" {
		parsed, err := strconv.ParseBool(rawEnabled)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_SMOOTHING=%q, defaulting to true", rawEnabled)
		} else {
			enabled = parsed
		}
	}

	charsPerChunk = DefaultStreamCharsPerChunk
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

	chunkDelay = DefaultStreamChunkDelay
	if rawDelay := strings.TrimSpace(os.Getenv("AGUI_STREAM_CHUNK_DELAY_MS")); rawDelay != "" {
		parsed, err := strconv.Atoi(rawDelay)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_CHUNK_DELAY_MS=%q, defaulting to %s", rawDelay, chunkDelay)
		} else if parsed >= 0 {
			chunkDelay = time.Duration(parsed) * time.Millisecond
		} else {
			log.Printf("AGUI_STREAM_CHUNK_DELAY_MS=%d is negative, using %s", parsed, DefaultStreamChunkDelay)
		}
	}

	return enabled, chunking, charsPerChunk, chunkDelay
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
	if stateless {
		// Suggestions and the homepage introduction should arrive at provider
		// speed, without the conversational typewriter pacing.
		cfg.smoothing.enabled = false
		cfg.smoothing.chunkDelay = 0
	}
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

	// Reject malformed declarations before leasing runs or mutating sessions.
	clientTools := input.Tools
	if err := validateClientToolDefinitions(clientTools); err != nil {
		log.Printf("run: invalid client tools: agent=%s thread=%s err=%v", entry.AppName, input.ThreadID, err)
		writeJSONError(w, http.StatusBadRequest, "invalid_agui_input")
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

	identity, ok := auth.FromContext(r.Context())
	if !ok {
		identity = auth.Identity{UserID: "anonymous", Public: true}
	}
	userID := effectiveUserID(identity, input.ThreadID)

	// A stateful active run, not the browser's SSE connection, owns execution.
	// A tab reload may cancel r.Context(), but the model should keep running so
	// the replacement /connect request can replay and follow it. Stateless
	// suggestions have no active-run replay path, so cancel them with the request
	// instead of spending provider work after their only client disconnects.
	executionCtx := r.Context()
	if !h.stateless {
		executionCtx = context.WithoutCancel(executionCtx)
	}
	ctx, cancel := context.WithTimeout(executionCtx, entry.Timeout)
	defer cancel()
	var active *activeRunLease
	if h.active != nil {
		key := runKey{AppName: entry.AppName, AgentRoute: entry.Route, UserID: userID, ThreadID: input.ThreadID}
		active, err = h.active.startDurable(ctx, key, input.RunID, time.Now().Add(entry.Timeout+activeRunLeaseGrace), cancel)
		if err != nil {
			log.Printf("run: active lease failed: agent=%s thread=%s run=%s err=%v", entry.AppName, input.ThreadID, input.RunID, err)
			if errors.Is(err, ErrActiveRunExists) {
				writeJSONErrorMessage(w, http.StatusInternalServerError, "Failed to run agent", "Thread already running")
				return
			}
			captureSessionError(ctx, err, entry, input, "active_run.begin")
			writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
			return
		}
		defer func() {
			if finishErr := active.finish(context.WithoutCancel(ctx)); finishErr != nil {
				log.Printf("run: active lease cleanup failed: agent=%s thread=%s run=%s err=%v", entry.AppName, input.ThreadID, input.RunID, finishErr)
				captureSessionError(context.WithoutCancel(ctx), finishErr, entry, input, "active_run.finish")
			}
		}()
		if h.active.store != nil {
			go monitorDurableStop(ctx, h.active.store, active.run.key, input.RunID, cancel)
		}
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
		captureSessionError(ctx, err, entry, input, "session.restore")
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
	if content != nil && len(clientTools) > 0 && h.pending == nil {
		log.Printf("run: client tools declared but pending store unavailable: agent=%s thread=%s", entry.AppName, input.ThreadID)
		writeJSONError(w, http.StatusBadRequest, "client_tools_unsupported")
		return
	}
	snapshot, err := persistentSnapshot(sess.State())
	if err != nil {
		log.Printf("run: session state encode failed: agent=%s thread=%s err=%v", entry.AppName, input.ThreadID, err)
		captureSessionError(ctx, err, entry, input, "session.snapshot")
		writeJSONError(w, http.StatusInternalServerError, "session_unavailable")
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
	execution := runExecution{
		runner: h.runner, input: input, userID: userID, content: content,
		stateDelta: overlay, snapshot: snapshot, smoothing: h.smoothing,
	}
	if content != nil {
		execution.converter = newStreamConverter(ctx, h.ids, snapshot, h.pending, scope, clientToolNames, h.smoothing, entry.Agent.Name())
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	emitter := newReplayAwareEmitter(w, active)
	transportFailureLogged := false
	transportFailed := false
	emit := func(writeCtx context.Context, event events.Event) error {
		err := emitter.Emit(writeCtx, event)
		var transportErr *eventTransportError
		if errors.As(err, &transportErr) {
			transportFailed = true
			if h.stateless {
				cancel()
			}
			if !transportFailureLogged && !isClientDisconnect(err) {
				log.Printf("run: original SSE response detached after transport failure: agent=%s thread=%s run=%s err=%v", entry.AppName, input.ThreadID, input.RunID, err)
				transportFailureLogged = true
			}
			return nil
		}
		return err
	}
	emitFailure := func(runErr error, stack []byte) {
		// The per-entry execution context may be canceled on timeout. Use a
		// non-cancelable derivative only for best-effort protocol closure and
		// terminal publication; agent execution remains bounded by ctx.
		terminalCtx := context.WithoutCancel(ctx)
		if err := execution.flush(terminalCtx, emit); err != nil {
			log.Printf("run: terminal lane flush failed: agent=%s thread=%s run=%s err=%v", entry.AppName, input.ThreadID, input.RunID, err)
		}
		log.Printf("run failed: agent=%s thread=%s user=%s run=%s err=%v", entry.AppName, input.ThreadID, userID, input.RunID, runErr)
		details := agentRunErrorDetails(runErr, entry, input)
		if len(stack) > 0 {
			details.Context["panic_stack"] = string(stack)
		}
		observability.CaptureError(terminalCtx, runErr, details)
		if err := emit(terminalCtx, sanitizeRunError(input.RunID, runErr)); err != nil && !errors.Is(err, errEventAfterTerminal) {
			log.Printf("run: RUN_ERROR emission failed: agent=%s thread=%s run=%s err=%v", entry.AppName, input.ThreadID, input.RunID, err)
		}
	}
	defer func() {
		recovered := recover()
		if recovered == nil {
			return
		}
		// Recovery is itself guarded: a broken converter or writer must not
		// re-panic through the outer net/http/Sentry boundary after SSE began.
		func() {
			defer func() {
				if secondary := recover(); secondary != nil {
					log.Printf("run: panic recovery failed: agent=%s thread=%s run=%s", entry.AppName, input.ThreadID, input.RunID)
				}
			}()
			emitFailure(fmt.Errorf("agent stream panic: %v", recovered), debug.Stack())
		}()
	}()
	if runErr := execution.execute(ctx, emit); runErr != nil {
		// Stateless suggestions have no reconnect consumer after disconnection.
		if h.stateless && errors.Is(runErr, context.Canceled) && (transportFailed || r.Context().Err() != nil) {
			return
		}
		emitFailure(runErr, nil)
	}
}

func monitorDurableStop(ctx context.Context, store ActiveRunStore, key ActiveRunKey, runID string, cancel context.CancelFunc) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		snapshot, err := store.LoadActiveRun(ctx, key, runID, -1)
		if err != nil {
			if errors.Is(err, ErrActiveRunNotFound) {
				return
			}
			continue
		}
		if snapshot.StopRequested {
			cancel()
			return
		}
	}
}

func isClientDisconnect(err error) bool {
	return errors.Is(err, context.Canceled) ||
		errors.Is(err, net.ErrClosed) ||
		errors.Is(err, syscall.EPIPE) ||
		errors.Is(err, syscall.ECONNRESET)
}

func agentRunErrorDetails(err error, entry agentruntime.Entry, input *types.RunAgentInput) observability.ErrorDetails {
	details := observability.ErrorDetails{
		Operation: "agent.run",
		Tags: map[string]string{
			"agent.app_name": entry.AppName,
			"agent.route":    entry.Route,
			"error.code":     classifyErrorCode(err),
		},
		Context: map[string]any{
			"run_id":    input.RunID,
			"thread_id": input.ThreadID,
		},
	}
	if responseErr, ok := errors.AsType[*adkResponseError](err); ok {
		details.Context["adk_error_code"] = responseErr.code
		details.Context["adk_error_message"] = responseErr.message
	}

	providerError, ok := providererrors.Details(err)
	if !ok {
		return details
	}
	details.Tags["provider.name"] = providerError.Provider
	details.Tags["provider.model"] = providerError.Model
	details.Tags["provider.error_kind"] = string(providerError.Kind)
	details.Tags["provider.retryable"] = strconv.FormatBool(providerError.Retryable)
	if providerError.Status != 0 {
		details.Tags["provider.status_code"] = strconv.Itoa(providerError.Status)
	}
	details.Fingerprint = []string{
		"agent.run", entry.Route, "provider",
		providerError.Provider, providerError.Model, string(providerError.Kind), strconv.Itoa(providerError.Status),
	}
	return details
}

func captureSessionError(ctx context.Context, err error, entry agentruntime.Entry, input *types.RunAgentInput, operation string) {
	observability.CaptureError(ctx, err, observability.ErrorDetails{
		Operation: operation,
		Tags: map[string]string{
			"agent.app_name": entry.AppName,
			"agent.route":    entry.Route,
			"error.code":     "session_unavailable",
		},
		Context: map[string]any{
			"run_id":    input.RunID,
			"thread_id": input.ThreadID,
		},
	})
}

// restoreSession fetches the existing (app, user, thread) session or
// creates one seeded with the agent's declared state defaults. Only
// session.ErrNotFound means creation is safe; storage outages and decode
// failures must propagate instead of being mistaken for a missing row.
// Create must seed entry.StateDefaults, so this cannot rely on the runner's
// automatic session creation.
func (h *ADKHandler) restoreSession(ctx context.Context, entry agentruntime.Entry, userID, threadID string, input *types.RunAgentInput) (session.Session, error) {
	response, err := h.sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	if err == nil {
		return response.Session, nil
	}
	if !errors.Is(err, session.ErrNotFound) {
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
	if err := common.WriteJSON(w, status, map[string]string{"error": code}); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

func writeJSONErrorMessage(w http.ResponseWriter, status int, code, message string) {
	if err := common.WriteJSON(w, status, map[string]string{"error": code, "message": message}); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}
