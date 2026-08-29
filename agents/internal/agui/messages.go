package agui

import (
	json "encoding/json/v2"
	"fmt"
	"strings"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// eventsToMessages converts a session's persisted ADK events into AG-UI
// Message objects, mirroring ag_ui_adk's adk_events_to_messages
// (event_translator.py in the Python reference):
//
//   - Partial events are skipped. In practice the D1-backed
//     cloudflare.SessionService never persists a Partial event (see
//     SessionService.AppendEvent), so this is defense in depth for any other
//     session.Service implementation.
//   - An event carrying one or more FunctionResponse parts becomes one
//     role:"tool" Message per response (mirrors Python's ToolMessage), and
//     contributes nothing else — matching adk_events_to_messages, which
//     `continue`s immediately after emitting tool messages for such an
//     event.
//   - An event authored by "user" becomes a role:"user" Message when it
//     carries visible text (thought parts are never surfaced for user
//     turns).
//   - Every other event is treated as an assistant turn: ADK-Go sets
//     Author to the running agent's name, never the literal "model" (see
//     runner.go), matching the Python comment that ADK agents set author to
//     the agent's own name. Any Part.Thought text is split into a
//     preceding role:"reasoning" Message, and function calls become
//     ToolCalls on a role:"assistant" Message.
func eventsToMessages(events session.Events) []types.Message {
	messages := []types.Message{}
	if events == nil {
		return messages
	}
	for event := range events.All() {
		messages = append(messages, eventToMessages(event)...)
	}
	return messages
}

func eventToMessages(event *session.Event) []types.Message {
	if event == nil || event.Partial {
		return nil
	}
	content := event.Content
	if content == nil || len(content.Parts) == 0 {
		return nil
	}

	var text, thinking strings.Builder
	var calls []*genai.FunctionCall
	var responses []*genai.FunctionResponse
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		if part.Text != "" {
			if part.Thought {
				thinking.WriteString(part.Text)
			} else {
				text.WriteString(part.Text)
			}
		}
		if part.FunctionCall != nil {
			calls = append(calls, part.FunctionCall)
		}
		if part.FunctionResponse != nil {
			responses = append(responses, part.FunctionResponse)
		}
	}

	if len(responses) > 0 {
		out := make([]types.Message, 0, len(responses))
		for index, response := range responses {
			out = append(out, toolResultMessage(event.ID, index, response))
		}
		return out
	}

	textContent, thinkingContent := text.String(), thinking.String()
	if textContent == "" && thinkingContent == "" && len(calls) == 0 {
		return nil
	}

	if event.Author == "user" {
		if textContent == "" {
			return nil
		}
		return []types.Message{{ID: event.ID, Role: types.RoleUser, Content: textContent}}
	}

	var out []types.Message
	if thinkingContent != "" {
		out = append(out, types.Message{ID: event.ID + "-reasoning", Role: types.RoleReasoning, Content: thinkingContent})
	}

	toolCalls := toAGUIToolCalls(calls)
	if textContent != "" || len(toolCalls) > 0 {
		assistant := types.Message{ID: event.ID, Role: types.RoleAssistant, ToolCalls: toolCalls}
		if textContent != "" {
			assistant.Content = textContent
		}
		// Mirrors Python's `author if author != "model" else None`: ADK-Go
		// never actually sets Author to "model" (see eventsToMessages'
		// doc comment), but the guard is kept to stay literally symmetric
		// with the reference implementation.
		if event.Author != "" && event.Author != "model" {
			assistant.Name = event.Author
		}
		out = append(out, assistant)
	}
	return out
}

// toAGUIToolCalls mirrors converter.go's toolCallEvents argument encoding
// (json.Marshal, falling back to "{}" on error) so a session's replayed
// history and its live SSE stream serialize tool arguments identically.
func toAGUIToolCalls(calls []*genai.FunctionCall) []types.ToolCall {
	if len(calls) == 0 {
		return nil
	}
	out := make([]types.ToolCall, 0, len(calls))
	for _, call := range calls {
		out = append(out, types.ToolCall{
			ID:   call.ID,
			Type: "function",
			Function: types.FunctionCall{
				Name:      call.Name,
				Arguments: encodeToolArgs(call.Args),
			},
		})
	}
	return out
}

// toolResultMessage mirrors converter.go's toolResultEvents payload
// encoding. The message ID is synthesized from the owning event's ID
// (unlike the Python reference's random uuid4) so replaying the same
// session twice yields byte-identical output.
func toolResultMessage(eventID string, index int, response *genai.FunctionResponse) types.Message {
	payload := response.Response
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		encoded = []byte("{}")
	}
	return types.Message{
		ID:         fmt.Sprintf("%s-tool-%d", eventID, index),
		Role:       types.RoleTool,
		Content:    string(encoded),
		ToolCallID: response.ID,
	}
}

func encodeToolArgs(args map[string]any) string {
	if args == nil {
		return "{}"
	}
	encoded, err := json.Marshal(args)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}
