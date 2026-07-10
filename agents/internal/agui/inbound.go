package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	aguitypes "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"github.com/aranlucas/agents/agents/internal/auth"
	"google.golang.org/genai"
)

// maxRunInputBytes bounds one AG-UI RunAgentInput request body.
const maxRunInputBytes = 1 << 20

// ErrInvalidRunInput is returned for structurally invalid or missing-field
// AG-UI RunAgentInput payloads.
var ErrInvalidRunInput = errors.New("invalid AG-UI run input")

// decodeRunInput parses and validates one AG-UI RunAgentInput request body.
func decodeRunInput(body io.Reader) (*aguitypes.RunAgentInput, error) {
	var input aguitypes.RunAgentInput
	decoder := json.NewDecoder(io.LimitReader(body, maxRunInputBytes+1))
	if err := decoder.Decode(&input); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	if strings.TrimSpace(input.ThreadID) == "" {
		return nil, fmt.Errorf("%w: threadId is required", ErrInvalidRunInput)
	}
	if strings.TrimSpace(input.RunID) == "" {
		return nil, fmt.Errorf("%w: runId is required", ErrInvalidRunInput)
	}
	return &input, nil
}

// clientToolsFromInput converts the AG-UI request's tool declarations into
// the frontend tool definitions NewClientToolset expects.
func clientToolsFromInput(input *aguitypes.RunAgentInput) []ClientTool {
	tools := make([]ClientTool, 0, len(input.Tools))
	for _, t := range input.Tools {
		tools = append(tools, ClientTool{Name: t.Name, Description: t.Description, Parameters: t.Parameters})
	}
	return tools
}

// runContent converts the newest turn of an AG-UI request into ADK-Go
// content. It looks at the trailing run of same-role messages rather than
// only the very last message: a resumed run can deliver several tool-result
// messages at once (parallel tool calls), and the newest message is not
// always plain user text — a resumed approval or oralboards answer arrives
// as one or more role:"tool" messages.
func runContent(ctx context.Context, input *aguitypes.RunAgentInput, identity auth.Identity, pending PendingTools, scope ToolScope) (*genai.Content, error) {
	if len(input.Messages) == 0 {
		return nil, nil
	}
	last := input.Messages[len(input.Messages)-1]
	switch last.Role {
	case aguitypes.RoleUser:
		return userContent(last)
	case aguitypes.RoleTool:
		return toolResultContent(ctx, input.Messages, identity, pending, scope)
	default:
		// Trailing assistant/system/other message: no fresh input for this
		// run (e.g. a reconnect that only wants the current snapshot).
		return nil, nil
	}
}

func userContent(msg aguitypes.Message) (*genai.Content, error) {
	if text, ok := msg.ContentString(); ok {
		if strings.TrimSpace(text) == "" {
			return nil, fmt.Errorf("%w: user message has no content", ErrInvalidRunInput)
		}
		return &genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{Text: text}}}, nil
	}
	if fragments, ok := msg.ContentInputContents(); ok {
		parts := make([]*genai.Part, 0, len(fragments))
		for _, fragment := range fragments {
			if fragment.Type == aguitypes.InputContentTypeText && fragment.Text != "" {
				parts = append(parts, &genai.Part{Text: fragment.Text})
			}
		}
		if len(parts) == 0 {
			return nil, fmt.Errorf("%w: user message has no text content", ErrInvalidRunInput)
		}
		return &genai.Content{Role: genai.RoleUser, Parts: parts}, nil
	}
	return nil, fmt.Errorf("%w: unsupported user message content", ErrInvalidRunInput)
}

// toolResultContent gathers every trailing role:"tool" message into one
// genai.Content carrying one FunctionResponse part per resumed call.
func toolResultContent(ctx context.Context, messages []aguitypes.Message, identity auth.Identity, pending PendingTools, scope ToolScope) (*genai.Content, error) {
	end := len(messages)
	start := end
	for start > 0 && messages[start-1].Role == aguitypes.RoleTool {
		start--
	}
	parts := make([]*genai.Part, 0, end-start)
	for _, msg := range messages[start:end] {
		response, err := resolveFunctionResponse(ctx, msg, messages, identity, pending, scope)
		if err != nil {
			return nil, err
		}
		parts = append(parts, &genai.Part{FunctionResponse: response})
	}
	return &genai.Content{Role: genai.RoleUser, Parts: parts}, nil
}

// resolveFunctionResponse converts one tool-result message into a
// genai.FunctionResponse. When a PendingTools store is configured, the
// call's name and content are resolved server-side (Resolve then Take) so a
// client can never spoof a tool name or replay a call across users/threads.
// Otherwise the tool name is resolved from the assistant tool-call message
// earlier in the same request's history.
func resolveFunctionResponse(ctx context.Context, msg aguitypes.Message, history []aguitypes.Message, identity auth.Identity, pending PendingTools, scope ToolScope) (*genai.FunctionResponse, error) {
	if strings.TrimSpace(msg.ToolCallID) == "" {
		return nil, fmt.Errorf("%w: tool result message has no toolCallId", ErrInvalidRunInput)
	}
	payload, err := toolResponsePayload(msg)
	if err != nil {
		return nil, err
	}
	if pending != nil {
		if resolveErr := pending.Resolve(ctx, identity, scope.AppName, scope.ThreadID, msg.ToolCallID, payload); resolveErr == nil {
			if response, takeErr := pending.Take(ctx, identity, scope.AppName, scope.ThreadID, msg.ToolCallID); takeErr == nil {
				return response, nil
			}
		}
	}
	name := toolNameFromHistory(history, msg.ToolCallID)
	if name == "" {
		return nil, fmt.Errorf("%w: tool result %q has no matching tool call", ErrInvalidRunInput, msg.ToolCallID)
	}
	return &genai.FunctionResponse{ID: msg.ToolCallID, Name: name, Response: payload}, nil
}

func toolNameFromHistory(history []aguitypes.Message, callID string) string {
	for _, msg := range history {
		for _, call := range msg.ToolCalls {
			if call.ID == callID {
				return call.Function.Name
			}
		}
	}
	return ""
}

func toolResponsePayload(msg aguitypes.Message) (map[string]any, error) {
	text, ok := msg.ContentString()
	if !ok {
		return nil, fmt.Errorf("%w: tool result content must be a string", ErrInvalidRunInput)
	}
	if strings.TrimSpace(text) == "" {
		return map[string]any{}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(text), &payload); err == nil {
		return payload, nil
	}
	return map[string]any{"result": text}, nil
}
