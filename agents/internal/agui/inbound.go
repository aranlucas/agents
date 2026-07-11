package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"agents/internal/auth"
	aguitypes "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
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
	return append([]aguitypes.Tool(nil), input.Tools...)
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
	var content *genai.Content
	var err error
	switch last.Role {
	case aguitypes.RoleUser:
		content, err = userContent(last)
	case aguitypes.RoleTool:
		content, err = toolResultContent(ctx, input.Messages, identity, pending, scope)
	default:
		// Trailing assistant/system/other message: no fresh input for this
		// run (e.g. a reconnect that only wants the current snapshot).
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if part := contextPart(input.Context); part != nil && content != nil {
		content.Parts = append([]*genai.Part{part}, content.Parts...)
	}
	return content, nil
}

// contextPart renders the AG-UI request's context entries (frontend-
// supplied description/value pairs, e.g. {"description":"current_page",
// "value":"/dashboard"}) as one text Part prepended to the turn's
// content, so the model unconditionally sees them.
//
// The Python reference (ag_ui_adk) instead stores input.context in ADK
// session state under a backend-managed '_ag_ui_context' key and leaves
// surfacing it to each agent's own instruction template (a custom
// instruction provider reading ctx.state) — see
// .venv/lib/python*/site-packages/ag_ui_adk/adk_agent.py. That only
// works because a Python agent author can wire an instruction provider
// per agent. This Go handler is agent-agnostic (ag-ui.go has no
// per-agent instruction template to reach into, and every ported agent
// shares this one handler), so it renders context directly into the
// turn's model input instead — protocol-equivalent (the model still
// receives the same description/value data) without requiring every
// ported agent to add a state-reading instruction hook.
func contextPart(entries []aguitypes.Context) *genai.Part {
	var b strings.Builder
	for _, entry := range entries {
		description := strings.TrimSpace(entry.Description)
		value := strings.TrimSpace(entry.Value)
		if description == "" && value == "" {
			continue
		}
		fmt.Fprintf(&b, "- %s: %s\n", description, value)
	}
	if b.Len() == 0 {
		return nil
	}
	return &genai.Part{Text: "Context:\n" + b.String()}
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
			// Only text fragments are converted here; binary/image/audio/
			// video InputContent fragments in a mixed multimodal user
			// message are silently dropped rather than converted or
			// erroring. No agent ported so far sends multimodal input to
			// this handler — revisit before wiring a vision-capable agent
			// (see task-7-report.md "Concerns").
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
