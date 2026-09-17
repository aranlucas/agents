package agui

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"maps"
	"strings"
	"unicode"

	"agents/internal/providererrors"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// streamConverter turns a stream of ADK session events for one invocation
// into ordered, typed AG-UI SDK events. Not safe for concurrent use; the
// handler owns exactly one converter per in-flight run.
type streamConverter struct {
	ctx       context.Context
	ids       events.IDGenerator
	smoothing streamSmoothing

	state stateDocument

	// pending, scope, and clientToolNames let toolCallEvents
	// pre-register a client tool call in the PendingStore before
	// returning the TOOL_CALL_* events that describe it, so a client that
	// answers instantly can never race the client proxy tool's own
	// (authoritative) Register call. pending is nil when the handler has
	// no PendingTools configured; clientToolNames is empty when the
	// request declared no AG-UI tools.
	pending         PendingTools
	scope           ToolScope
	clientToolNames map[string]bool

	textMessageID      string
	reasoningMessageID string

	// lastFinalText is the most recent assistant text where
	// event.IsFinalResponse() was true; used to populate RUN_FINISHED.Result.
	lastFinalText string
	rootAuthor    string
	turnTextID    string

	// interrupts collects native ADK RequestInput pauses so the handler can
	// finish the AG-UI run with the standard interrupt outcome. The synthesized
	// adk_request_input tool call is still streamed for message-history
	// compatibility, but it is not itself the terminal protocol signal.
	interrupts []types.Interrupt
}

func newStreamConverter(ctx context.Context, ids events.IDGenerator, state stateDocument, pending PendingTools, scope ToolScope, clientToolNames map[string]bool, smoothing streamSmoothing, rootAuthor ...string) *streamConverter {
	if ids == nil {
		ids = events.NewDefaultIDGenerator()
	}
	if state == nil {
		state = make(stateDocument)
	}
	if !smoothing.enabled {
		smoothing.enabled = false
	}
	if smoothing.charsPerChunk <= 0 {
		smoothing.charsPerChunk = DefaultStreamCharsPerChunk
	}
	if smoothing.chunkDelay < 0 {
		smoothing.chunkDelay = 0
	}
	root := ""
	if len(rootAuthor) > 0 {
		root = rootAuthor[0]
	}
	return &streamConverter{ctx: ctx, ids: ids, state: state, pending: pending, scope: scope, clientToolNames: clientToolNames, smoothing: smoothing, rootAuthor: root}
}

type adkResponseError struct {
	code        string
	message     string
	interrupted bool
}

func (e *adkResponseError) Error() string {
	if e.interrupted {
		return "ADK model response was interrupted"
	}
	return "ADK model response failed"
}

// Convert converts one ADK session event into zero or more ordered AG-UI
// SDK events. It reads event.Partial, event.LLMResponse.Content,
// event.Actions.StateDelta, and event.IsFinalResponse() per the ADK-Go v2
// event contract: Partial is set only for incremental plain-text/reasoning
// deltas, while function calls, function responses, and state deltas always
// arrive on a final (non-partial) event.
func (c *streamConverter) Convert(event *session.Event) ([]events.Event, error) {
	if event == nil {
		return nil, nil
	}
	if event.ErrorCode != "" || event.ErrorMessage != "" {
		return nil, &adkResponseError{code: event.ErrorCode, message: event.ErrorMessage}
	}
	if event.Interrupted {
		return nil, &adkResponseError{code: "interrupted", interrupted: true}
	}
	content := event.Content

	if event.Partial {
		return c.convertPartial(content)
	}
	return c.convertFinal(event, content)
}

func (c *streamConverter) convertPartial(content *genai.Content) ([]events.Event, error) {
	if content == nil {
		return nil, nil
	}
	var out []events.Event
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		switch {
		case part.Thought && part.Text != "":
			out = append(out, c.closeText()...)
			out = append(out, c.openReasoning()...)
			out = append(out, events.NewReasoningMessageContentEvent(c.reasoningMessageID, part.Text))
		case !part.Thought && part.Text != "":
			out = append(out, c.closeReasoning()...)
			out = append(out, c.openText()...)
			out = append(out, c.textContentEvents(c.textMessageID, part.Text)...)
		}
	}
	return out, nil
}

func (c *streamConverter) convertFinal(event *session.Event, content *genai.Content) ([]events.Event, error) {
	// Prepare every fallible part before mutating converter state or registering
	// client calls. If a later tool result or state value is malformed, Convert
	// emits nothing, Flush can still close lanes already visible to the client,
	// and no invisible pending call remains in D1.
	var toolEvents []events.Event
	var registrations []pendingRegistration
	if content != nil {
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if part.FunctionCall != nil {
				converted, registration, err := c.toolCallEvents(part.FunctionCall)
				if err != nil {
					return nil, err
				}
				toolEvents = append(toolEvents, converted...)
				if registration != nil {
					registrations = append(registrations, *registration)
				}
			}
			if part.FunctionResponse != nil {
				converted, err := c.toolResultEvents(part.FunctionResponse)
				if err != nil {
					return nil, err
				}
				toolEvents = append(toolEvents, converted...)
			}
		}
	}

	stagedState := maps.Clone(c.state)
	delta, err := statePatch(stagedState, event.Actions.StateDelta)
	if err != nil {
		return nil, fmt.Errorf("convert state delta: %w", err)
	}
	if len(registrations) > 0 {
		batch := make([]PendingToolCall, 0, len(registrations))
		for _, registration := range registrations {
			batch = append(batch, PendingToolCall{CallID: registration.id, ToolName: registration.name, Args: registration.args})
		}
		if err := c.pending.RegisterBatch(c.ctx, c.scope, batch); err != nil {
			return nil, fmt.Errorf("register model client tool calls: %w", err)
		}
	}

	// All remaining work is infallible. Commit the staged converter state, then
	// construct the ordered event slice.
	clear(c.state)
	maps.Copy(c.state, stagedState)
	if event.RequestedInput != nil {
		c.captureInterrupt(event.RequestedInput)
	}
	// Capture whether a lane was already streaming before closing it: model
	// adapters (see internal/providers/openai) commonly resend the full
	// cumulative text on the final frame after streaming it incrementally,
	// so a lane that was already open must only be closed, never re-emitted
	// as a duplicate one-shot message.
	hadText := c.textMessageID != ""
	hadReasoning := c.reasoningMessageID != ""
	var out []events.Event
	out = append(out, c.closeReasoning()...)
	out = append(out, c.closeText()...)
	if content != nil {
		out = append(out, c.oneShotLanes(content, hadText, hadReasoning)...)
		if c.turnTextID != "" {
			for _, converted := range toolEvents {
				if started, ok := converted.(*events.ToolCallStartEvent); ok {
					started.ParentMessageID = new(c.turnTextID)
				}
			}
		}
		out = append(out, toolEvents...)
	}
	if len(delta) > 0 {
		out = append(out, events.NewStateDeltaEvent(delta))
	}

	if event.IsFinalResponse() {
		if text := contentText(content); text != "" && (c.rootAuthor == "" || event.Author == c.rootAuthor) {
			c.lastFinalText = text
		}
	}
	c.turnTextID = ""

	return out, nil
}

func (c *streamConverter) captureInterrupt(request *session.RequestInput) {
	interrupt, ok := requestInputInterrupt(request)
	if !ok {
		return
	}
	for index := range c.interrupts {
		if c.interrupts[index].ID == interrupt.ID {
			c.interrupts[index] = interrupt
			return
		}
	}
	c.interrupts = append(c.interrupts, interrupt)
}

func (c *streamConverter) Interrupts() []types.Interrupt {
	return append([]types.Interrupt(nil), c.interrupts...)
}

// oneShotLanes handles the non-streaming case: a model that never emitted a
// partial delta but returned complete text/reasoning directly on the final
// event. Streaming models close an already-open lane above instead of
// re-emitting content here.
func (c *streamConverter) oneShotLanes(content *genai.Content, hadText, hadReasoning bool) []events.Event {
	var out []events.Event
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		switch {
		case part.Thought && part.Text != "" && !hadReasoning:
			out = append(out, c.closeText()...)
			out = append(out, c.openReasoning()...)
			out = append(out, events.NewReasoningMessageContentEvent(c.reasoningMessageID, part.Text))
		case !part.Thought && part.Text != "" && !hadText:
			out = append(out, c.closeReasoning()...)
			out = append(out, c.openText()...)
			out = append(out, c.textContentEvents(c.textMessageID, part.Text)...)
		}
	}
	out = append(out, c.closeReasoning()...)
	out = append(out, c.closeText()...)
	return out
}

func (c *streamConverter) openText() []events.Event {
	if c.textMessageID != "" {
		return nil
	}
	c.textMessageID = c.ids.GenerateMessageID()
	c.turnTextID = c.textMessageID
	return []events.Event{events.NewTextMessageStartEvent(c.textMessageID, events.WithRole("assistant"))}
}

func (c *streamConverter) textContentEvents(messageID, text string) []events.Event {
	if text == "" {
		return nil
	}
	if !c.smoothing.enabled || c.smoothing.charsPerChunk <= 0 {
		return []events.Event{events.NewTextMessageContentEvent(messageID, text)}
	}

	chunks := splitTextChunks(text, c.smoothing)
	out := make([]events.Event, 0, len(chunks))
	for _, chunk := range chunks {
		out = append(out, events.NewTextMessageContentEvent(messageID, chunk))
	}
	return out
}

func splitTextChunks(text string, cfg streamSmoothing) []string {
	switch cfg.chunking {
	case streamChunkingLine:
		return splitByLine(text)
	case streamChunkingChar:
		return splitIntoRuneChunks(text, cfg.charsPerChunk)
	case streamChunkingWord:
		fallthrough
	default:
		return splitByWord(text)
	}
}

func splitByLine(text string) []string {
	if text == "" {
		return nil
	}
	lines := strings.SplitAfter(text, "\n")
	if len(lines) == 0 {
		return []string{text}
	}
	if strings.HasSuffix(text, "\n") {
		return lines
	}
	return lines
}

func splitByWord(text string) []string {
	if text == "" {
		return nil
	}
	runes := []rune(text)
	var chunks []string
	for i := 0; i < len(runes); {
		j := i
		for j < len(runes) && !unicode.IsSpace(runes[j]) {
			j++
		}
		if j > i {
			chunks = append(chunks, string(runes[i:j]))
			i = j
		}
		j = i
		for j < len(runes) && unicode.IsSpace(runes[j]) {
			j++
		}
		if j > i {
			chunks = append(chunks, string(runes[i:j]))
			i = j
		}
	}
	if len(chunks) == 0 {
		return []string{text}
	}
	return chunks
}

func splitIntoRuneChunks(text string, chunkSize int) []string {
	if chunkSize <= 0 {
		return []string{text}
	}
	parts := []rune(text)
	if len(parts) <= chunkSize {
		return []string{text}
	}
	out := make([]string, 0, (len(parts)+chunkSize-1)/chunkSize)
	for i := 0; i < len(parts); i += chunkSize {
		j := min(i+chunkSize, len(parts))
		out = append(out, string(parts[i:j]))
	}
	return out
}

func (c *streamConverter) closeText() []events.Event {
	if c.textMessageID == "" {
		return nil
	}
	id := c.textMessageID
	c.textMessageID = ""
	return []events.Event{events.NewTextMessageEndEvent(id)}
}

func (c *streamConverter) openReasoning() []events.Event {
	if c.reasoningMessageID != "" {
		return nil
	}
	c.reasoningMessageID = c.ids.GenerateMessageID()
	return []events.Event{
		events.NewReasoningStartEvent(c.reasoningMessageID),
		events.NewReasoningMessageStartEvent(c.reasoningMessageID, string(types.RoleReasoning)),
	}
}

func (c *streamConverter) closeReasoning() []events.Event {
	if c.reasoningMessageID == "" {
		return nil
	}
	id := c.reasoningMessageID
	c.reasoningMessageID = ""
	return []events.Event{
		events.NewReasoningMessageEndEvent(id),
		events.NewReasoningEndEvent(id),
	}
}

type pendingRegistration struct {
	id   string
	name string
	args []byte
}

func (c *streamConverter) toolCallEvents(call *genai.FunctionCall) ([]events.Event, *pendingRegistration, error) {
	if call == nil || !ClientToolName.MatchString(call.Name) {
		return nil, nil, errors.New("invalid model tool call name")
	}
	id := call.ID
	if id == "" {
		id = c.ids.GenerateToolCallID()
	}
	if !ClientCallID.MatchString(id) {
		return nil, nil, errors.New("invalid model tool call ID")
	}
	args := call.Args
	if args == nil {
		args = map[string]any{}
	}
	encoded, err := json.Marshal(args)
	if err != nil {
		return nil, nil, errors.New("encode model tool call arguments")
	}
	var registration *pendingRegistration
	if c.pending != nil && c.clientToolNames[call.Name] {
		// Stage pre-registration: client_tools.go's proxy tool
		// tool closure is the authoritative Register call (it runs with
		// ctx.FunctionCallID(), inside the tool execution ADK drives
		// after this event is yielded — see ADK-Go's base_flow.go, which
		// yields the model-response event containing this FunctionCall
		// *before* invoking the tool). convertFinal commits this only after all
		// calls/results in the model event validate, and before any
		// TOOL_CALL_* frame is written to the SSE response, closes that
		// gap: PendingStore.Register is idempotent (ON CONFLICT DO
		// NOTHING), so the tool's later call is a harmless no-op.
		registration = &pendingRegistration{id: id, name: call.Name, args: encoded}
	}
	return []events.Event{
		events.NewToolCallStartEvent(id, call.Name),
		events.NewToolCallArgsEvent(id, string(encoded)),
		events.NewToolCallEndEvent(id),
	}, registration, nil
}

func (c *streamConverter) toolResultEvents(response *genai.FunctionResponse) ([]events.Event, error) {
	if response == nil || !ClientCallID.MatchString(response.ID) {
		return nil, errors.New("invalid model tool result ID")
	}
	payload := response.Response
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, errors.New("encode model tool result")
	}
	return []events.Event{
		events.NewToolCallResultEvent(c.ids.GenerateMessageID(), response.ID, string(encoded)),
	}, nil
}

// Flush closes any dangling open text/reasoning lane. Called before an
// error event so a well-formed TEXT_MESSAGE_START/REASONING_START is never
// left without its matching END when a run is aborted mid-stream.
func (c *streamConverter) Flush() []events.Event {
	var out []events.Event
	out = append(out, c.closeReasoning()...)
	out = append(out, c.closeText()...)
	return out
}

func contentText(content *genai.Content) string {
	if content == nil {
		return ""
	}
	var b strings.Builder
	for _, part := range content.Parts {
		if part != nil && !part.Thought && part.Text != "" {
			b.WriteString(part.Text)
		}
	}
	return b.String()
}

// sanitizeRunError converts an internal error into a RUN_ERROR event that
// never leaks provider keys, OAuth tokens, raw database errors, or stack
// traces: only a small allow-listed set of sentinel errors gets a
// human-readable message; everything else collapses to a generic message.
func sanitizeRunError(runID string, err error) *events.RunErrorEvent {
	code, message := classifyError(err)
	return events.NewRunErrorEvent(message, events.WithErrorCode(code), events.WithRunID(runID))
}

func classifyErrorCode(err error) string {
	code, _ := classifyError(err)
	return code
}

func classifyError(err error) (code, message string) {
	if responseErr, ok := errors.AsType[*adkResponseError](err); ok {
		if responseErr.interrupted {
			return "canceled", "the agent run was canceled"
		}
		return "provider_error", "the model provider is unavailable; try again shortly"
	}
	switch {
	case err == nil:
		return "internal_error", "the agent run failed"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout", "the agent run timed out"
	case errors.Is(err, context.Canceled):
		return "canceled", "the agent run was canceled"
	case errors.Is(err, session.ErrNotFound):
		return "session_not_found", "the session could not be found"
	case errors.Is(err, ErrInvalidRunInput):
		return "invalid_input", "the request could not be processed"
	}
	if providerError, ok := providererrors.Details(err); ok {
		switch providerError.Kind {
		case providererrors.RateLimit, providererrors.CircuitOpen:
			return providerErrorCode(providerError.Kind), "the agent is busy; try again shortly"
		case providererrors.NotFound,
			providererrors.Authentication,
			providererrors.Configuration:
			return providerErrorCode(providerError.Kind), "the agent's model is temporarily unavailable"
		default:
			return providerErrorCode(providerError.Kind), "the model provider is unavailable; try again shortly"
		}
	}
	return "internal_error", "the agent run failed"
}

func providerErrorCode(kind providererrors.Kind) string {
	return "provider_" + string(kind)
}
