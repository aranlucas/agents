package agui

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"unicode"

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

	// interrupts collects native ADK RequestInput pauses so the handler can
	// finish the AG-UI run with the standard interrupt outcome. The synthesized
	// adk_request_input tool call is still streamed for message-history
	// compatibility, but it is not itself the terminal protocol signal.
	interrupts []types.Interrupt
}

func newStreamConverter(ctx context.Context, ids events.IDGenerator, state stateDocument, pending PendingTools, scope ToolScope, clientToolNames map[string]bool, smoothing streamSmoothing) *streamConverter {
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
		smoothing.charsPerChunk = 64
	}
	if smoothing.chunkDelay < 0 {
		smoothing.chunkDelay = 0
	}
	return &streamConverter{ctx: ctx, ids: ids, state: state, pending: pending, scope: scope, clientToolNames: clientToolNames, smoothing: smoothing}
}

// Convert converts one ADK session event into zero or more ordered AG-UI
// SDK events. It reads event.Partial, event.LLMResponse.Content,
// event.Actions.StateDelta, and event.IsFinalResponse() per the ADK-Go v2
// event contract: Partial is set only for incremental plain-text/reasoning
// deltas, while function calls, function responses, and state deltas always
// arrive on a final (non-partial) event.
func (c *streamConverter) Convert(event *session.Event) []events.Event {
	if event == nil {
		return nil
	}
	content := event.Content

	if event.Partial {
		return c.convertPartial(content)
	}
	return c.convertFinal(event, content)
}

func (c *streamConverter) convertPartial(content *genai.Content) []events.Event {
	if content == nil {
		return nil
	}
	var out []events.Event
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		switch {
		case part.Thought && part.Text != "":
			out = append(out, c.openReasoning()...)
			out = append(out, events.NewReasoningMessageContentEvent(c.reasoningMessageID, part.Text))
		case !part.Thought && part.Text != "":
			out = append(out, c.openText()...)
			out = append(out, c.textContentEvents(c.textMessageID, part.Text)...)
		}
	}
	return out
}

func (c *streamConverter) convertFinal(event *session.Event, content *genai.Content) []events.Event {
	var out []events.Event
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
	out = append(out, c.closeReasoning()...)
	out = append(out, c.closeText()...)

	if content != nil {
		out = append(out, c.oneShotLanes(content, hadText, hadReasoning)...)
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if part.FunctionCall != nil {
				out = append(out, c.toolCallEvents(part.FunctionCall)...)
			}
			if part.FunctionResponse != nil {
				out = append(out, c.toolResultEvents(part.FunctionResponse)...)
			}
		}
	}

	delta, err := statePatch(c.state, event.Actions.StateDelta)
	if err != nil {
		log.Printf("convert state delta: %v", err)
	} else if len(delta) > 0 {
		out = append(out, events.NewStateDeltaEvent(delta))
	}

	if event.IsFinalResponse() {
		if text := contentText(content); text != "" {
			c.lastFinalText = text
		}
	}

	return out
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
	var reasoningText, plainText strings.Builder
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		switch {
		case part.Thought && part.Text != "":
			reasoningText.WriteString(part.Text)
		case !part.Thought && part.Text != "":
			plainText.WriteString(part.Text)
		}
	}

	var out []events.Event
	if reasoningText.Len() > 0 && !hadReasoning {
		id := c.ids.GenerateMessageID()
		out = append(
			out,
			events.NewReasoningStartEvent(id),
			events.NewReasoningMessageStartEvent(id, "assistant"),
			events.NewReasoningMessageContentEvent(id, reasoningText.String()),
			events.NewReasoningMessageEndEvent(id),
			events.NewReasoningEndEvent(id),
		)
	}
	if plainText.Len() > 0 && !hadText {
		id := c.ids.GenerateMessageID()
		out = append(
			out,
			events.NewTextMessageStartEvent(id, events.WithRole("assistant")),
		)
		out = append(out, c.textContentEvents(id, plainText.String())...)
		out = append(
			out,
			events.NewTextMessageEndEvent(id),
		)
	}
	return out
}

func (c *streamConverter) openText() []events.Event {
	if c.textMessageID != "" {
		return nil
	}
	c.textMessageID = c.ids.GenerateMessageID()
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
		j := i + chunkSize
		if j > len(parts) {
			j = len(parts)
		}
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

func (c *streamConverter) toolCallEvents(call *genai.FunctionCall) []events.Event {
	id := call.ID
	if id == "" {
		id = c.ids.GenerateToolCallID()
	}
	args := call.Args
	if args == nil {
		args = map[string]any{}
	}
	encoded, err := json.Marshal(args)
	if c.pending != nil && c.clientToolNames[call.Name] && err == nil {
		// Best-effort pre-registration: client_tools.go's proxy tool
		// tool closure is the authoritative Register call (it runs with
		// ctx.FunctionCallID(), inside the tool execution ADK drives
		// after this event is yielded — see ADK-Go's base_flow.go, which
		// yields the model-response event containing this FunctionCall
		// *before* invoking the tool). Registering here too, before any
		// TOOL_CALL_* frame is written to the SSE response, closes that
		// gap: PendingStore.Register is idempotent (ON CONFLICT DO
		// NOTHING), so the tool's later call is a harmless no-op.
		_ = c.pending.Register(c.ctx, c.scope, id, call.Name, encoded)
	}
	if err != nil {
		encoded = []byte("{}")
	}
	return []events.Event{
		events.NewToolCallStartEvent(id, call.Name),
		events.NewToolCallArgsEvent(id, string(encoded)),
		events.NewToolCallEndEvent(id),
	}
}

func (c *streamConverter) toolResultEvents(response *genai.FunctionResponse) []events.Event {
	payload := response.Response
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		encoded = []byte("{}")
	}
	return []events.Event{
		events.NewToolCallResultEvent(c.ids.GenerateMessageID(), response.ID, string(encoded)),
	}
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
	switch {
	case err == nil:
		return "internal_error", "the agent run failed"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout", "the agent run timed out"
	case errors.Is(err, context.Canceled):
		return "canceled", "the agent run was canceled"
	case errors.Is(err, ErrSessionNotFound):
		return "session_not_found", "the session could not be found"
	case errors.Is(err, ErrInvalidRunInput):
		return "invalid_input", "the request could not be processed"
	default:
		return "internal_error", "the agent run failed"
	}
}
