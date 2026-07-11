package agui

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	aguitypes "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

const mcpAppActivityStatePrefix = "temp:mcp_app_activity:"
const a2uiActivityStatePrefix = "temp:a2ui_activity:"

type mcpAppActivity struct {
	MessageID string `json:"messageId"`
	Content   any    `json:"content"`
}

// newBase builds a BaseEvent with no timestamp. The AG-UI SDK's New*Event
// constructors always stamp TimestampMs from time.Now(), which would make
// golden SSE fixtures non-deterministic; timestamp is optional
// (`json:"timestamp,omitempty"`) per the AG-UI wire format, so omitting it
// is protocol-valid and keeps every emitted frame byte-for-byte reproducible.
func newBase(eventType aguievents.EventType) *aguievents.BaseEvent {
	return &aguievents.BaseEvent{EventType: eventType}
}

// streamConverter turns a stream of ADK session events for one invocation
// into ordered, typed AG-UI SDK events. Not safe for concurrent use; the
// handler owns exactly one converter per in-flight run.
type streamConverter struct {
	ctx context.Context
	ids aguievents.IDGenerator

	known map[string]bool

	// pending, scope, and clientToolNames let toolCallEvents
	// pre-register a client tool call in the PendingStore before
	// returning the TOOL_CALL_* events that describe it, so a client that
	// answers instantly can never race the ClientToolset tool's own
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
}

func newStreamConverter(ctx context.Context, ids aguievents.IDGenerator, known map[string]bool, pending PendingTools, scope ToolScope, clientToolNames map[string]bool) *streamConverter {
	if ids == nil {
		ids = aguievents.NewDefaultIDGenerator()
	}
	if known == nil {
		known = make(map[string]bool)
	}
	return &streamConverter{ctx: ctx, ids: ids, known: known, pending: pending, scope: scope, clientToolNames: clientToolNames}
}

// Convert converts one ADK session event into zero or more ordered AG-UI
// SDK events. It reads event.Partial, event.LLMResponse.Content,
// event.Actions.StateDelta, and event.IsFinalResponse() per the ADK-Go v2
// event contract: Partial is set only for incremental plain-text/reasoning
// deltas, while function calls, function responses, and state deltas always
// arrive on a final (non-partial) event.
func (c *streamConverter) Convert(event *session.Event) []aguievents.Event {
	if event == nil {
		return nil
	}
	content := event.Content

	if event.Partial {
		return c.convertPartial(content)
	}
	return c.convertFinal(event, content)
}

func (c *streamConverter) convertPartial(content *genai.Content) []aguievents.Event {
	if content == nil {
		return nil
	}
	var out []aguievents.Event
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		switch {
		case part.Thought && part.Text != "":
			out = append(out, c.openReasoning()...)
			out = append(out, &aguievents.ReasoningMessageContentEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageContent), MessageID: c.reasoningMessageID, Delta: part.Text})
		case !part.Thought && part.Text != "":
			out = append(out, c.openText()...)
			out = append(out, &aguievents.TextMessageContentEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageContent), MessageID: c.textMessageID, Delta: part.Text})
		}
	}
	return out
}

func (c *streamConverter) convertFinal(event *session.Event, content *genai.Content) []aguievents.Event {
	var out []aguievents.Event
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

	out = append(out, c.activityEvents(event.Actions.StateDelta)...)
	if delta := statePatch(c.known, event.Actions.StateDelta); len(delta) > 0 {
		out = append(out, &aguievents.StateDeltaEvent{BaseEvent: newBase(aguievents.EventTypeStateDelta), Delta: delta})
	}

	if event.IsFinalResponse() {
		if text := contentText(content); text != "" {
			c.lastFinalText = text
		}
	}

	return out
}

func (c *streamConverter) activityEvents(delta map[string]any) []aguievents.Event {
	var out []aguievents.Event
	for key, raw := range delta {
		activityType := ""
		switch {
		case strings.HasPrefix(key, mcpAppActivityStatePrefix):
			activityType = "mcp-apps"
		case strings.HasPrefix(key, a2uiActivityStatePrefix):
			activityType = "a2ui-surface"
		default:
			continue
		}
		encoded, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		var activity mcpAppActivity
		if err := json.Unmarshal(encoded, &activity); err != nil || activity.Content == nil {
			continue
		}
		if activity.MessageID == "" {
			activity.MessageID = c.ids.GenerateMessageID()
		}
		out = append(out, &aguievents.ActivitySnapshotEvent{
			BaseEvent: newBase(aguievents.EventTypeActivitySnapshot), MessageID: activity.MessageID,
			ActivityType: activityType, Content: activity.Content,
		})
	}
	return out
}

// oneShotLanes handles the non-streaming case: a model that never emitted a
// partial delta but returned complete text/reasoning directly on the final
// event. Streaming models close an already-open lane above instead of
// re-emitting content here.
func (c *streamConverter) oneShotLanes(content *genai.Content, hadText, hadReasoning bool) []aguievents.Event {
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

	var out []aguievents.Event
	if reasoningText.Len() > 0 && !hadReasoning {
		id := c.ids.GenerateMessageID()
		out = append(out,
			&aguievents.ReasoningStartEvent{BaseEvent: newBase(aguievents.EventTypeReasoningStart), MessageID: id},
			&aguievents.ReasoningMessageStartEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageStart), MessageID: id, Role: "assistant"},
			&aguievents.ReasoningMessageContentEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageContent), MessageID: id, Delta: reasoningText.String()},
			&aguievents.ReasoningMessageEndEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageEnd), MessageID: id},
			&aguievents.ReasoningEndEvent{BaseEvent: newBase(aguievents.EventTypeReasoningEnd), MessageID: id},
		)
	}
	if plainText.Len() > 0 && !hadText {
		id := c.ids.GenerateMessageID()
		role := "assistant"
		out = append(out,
			&aguievents.TextMessageStartEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageStart), MessageID: id, Role: &role},
			&aguievents.TextMessageContentEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageContent), MessageID: id, Delta: plainText.String()},
			&aguievents.TextMessageEndEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageEnd), MessageID: id},
		)
	}
	return out
}

func (c *streamConverter) openText() []aguievents.Event {
	if c.textMessageID != "" {
		return nil
	}
	c.textMessageID = c.ids.GenerateMessageID()
	role := "assistant"
	return []aguievents.Event{&aguievents.TextMessageStartEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageStart), MessageID: c.textMessageID, Role: &role}}
}

func (c *streamConverter) closeText() []aguievents.Event {
	if c.textMessageID == "" {
		return nil
	}
	id := c.textMessageID
	c.textMessageID = ""
	return []aguievents.Event{&aguievents.TextMessageEndEvent{BaseEvent: newBase(aguievents.EventTypeTextMessageEnd), MessageID: id}}
}

func (c *streamConverter) openReasoning() []aguievents.Event {
	if c.reasoningMessageID != "" {
		return nil
	}
	c.reasoningMessageID = c.ids.GenerateMessageID()
	return []aguievents.Event{
		&aguievents.ReasoningStartEvent{BaseEvent: newBase(aguievents.EventTypeReasoningStart), MessageID: c.reasoningMessageID},
		&aguievents.ReasoningMessageStartEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageStart), MessageID: c.reasoningMessageID, Role: string(aguitypes.RoleReasoning)},
	}
}

func (c *streamConverter) closeReasoning() []aguievents.Event {
	if c.reasoningMessageID == "" {
		return nil
	}
	id := c.reasoningMessageID
	c.reasoningMessageID = ""
	return []aguievents.Event{
		&aguievents.ReasoningMessageEndEvent{BaseEvent: newBase(aguievents.EventTypeReasoningMessageEnd), MessageID: id},
		&aguievents.ReasoningEndEvent{BaseEvent: newBase(aguievents.EventTypeReasoningEnd), MessageID: id},
	}
}

func (c *streamConverter) toolCallEvents(call *genai.FunctionCall) []aguievents.Event {
	id := call.ID
	if id == "" {
		id = c.ids.GenerateToolCallID()
	}
	args := call.Args
	if args == nil {
		args = map[string]any{}
	}
	if c.pending != nil && c.clientToolNames[call.Name] {
		// Best-effort pre-registration: client_tools.go's ClientToolset
		// tool closure is the authoritative Register call (it runs with
		// ctx.FunctionCallID(), inside the tool execution ADK drives
		// after this event is yielded — see ADK-Go's base_flow.go, which
		// yields the model-response event containing this FunctionCall
		// *before* invoking the tool). Registering here too, before any
		// TOOL_CALL_* frame is written to the SSE response, closes that
		// gap: PendingStore.Register is idempotent (ON CONFLICT DO
		// NOTHING), so the tool's later call is a harmless no-op.
		_ = c.pending.Register(c.ctx, c.scope, id, call.Name, args)
	}
	encoded, err := json.Marshal(args)
	if err != nil {
		encoded = []byte("{}")
	}
	return []aguievents.Event{
		&aguievents.ToolCallStartEvent{BaseEvent: newBase(aguievents.EventTypeToolCallStart), ToolCallID: id, ToolCallName: call.Name},
		&aguievents.ToolCallArgsEvent{BaseEvent: newBase(aguievents.EventTypeToolCallArgs), ToolCallID: id, Delta: string(encoded)},
		&aguievents.ToolCallEndEvent{BaseEvent: newBase(aguievents.EventTypeToolCallEnd), ToolCallID: id},
	}
}

func (c *streamConverter) toolResultEvents(response *genai.FunctionResponse) []aguievents.Event {
	payload := response.Response
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		encoded = []byte("{}")
	}
	return []aguievents.Event{
		&aguievents.ToolCallResultEvent{BaseEvent: newBase(aguievents.EventTypeToolCallResult), MessageID: c.ids.GenerateMessageID(), ToolCallID: response.ID, Content: string(encoded)},
	}
}

// Flush closes any dangling open text/reasoning lane. Called before an
// error event so a well-formed TEXT_MESSAGE_START/REASONING_START is never
// left without its matching END when a run is aborted mid-stream.
func (c *streamConverter) Flush() []aguievents.Event {
	var out []aguievents.Event
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
func sanitizeRunError(runID string, err error) *aguievents.RunErrorEvent {
	code, message := classifyError(err)
	return &aguievents.RunErrorEvent{BaseEvent: newBase(aguievents.EventTypeRunError), Code: &code, Message: message, RunIDValue: runID}
}

func classifyError(err error) (code, message string) {
	switch {
	case err == nil:
		return "internal_error", "the agent run failed"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout", "the agent run timed out"
	case errors.Is(err, context.Canceled):
		return "canceled", "the agent run was canceled"
	case errors.Is(err, cloudflare.ErrSessionNotFound):
		return "session_not_found", "the session could not be found"
	case errors.Is(err, ErrInvalidRunInput):
		return "invalid_input", "the request could not be processed"
	default:
		return "internal_error", "the agent run failed"
	}
}
