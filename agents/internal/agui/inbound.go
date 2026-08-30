package agui

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"strings"

	"agents/internal/auth"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"
)

// maxRunInputBytes bounds one AG-UI RunAgentInput request body.
const maxRunInputBytes = 1 << 20

// ErrInvalidRunInput is returned for structurally invalid or missing-field
// AG-UI RunAgentInput payloads.
var ErrInvalidRunInput = errors.New("invalid AG-UI run input")

// decodeRunInput parses and validates one AG-UI RunAgentInput request body.
func decodeRunInput(body io.Reader) (*types.RunAgentInput, error) {
	payload, err := io.ReadAll(io.LimitReader(body, maxRunInputBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: read request body", ErrInvalidRunInput)
	}
	if len(payload) > maxRunInputBytes {
		return nil, fmt.Errorf("%w: request body exceeds %d bytes", ErrInvalidRunInput, maxRunInputBytes)
	}
	var input types.RunAgentInput
	if err := json.Unmarshal(payload, &input); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	// RunAgentInput intentionally leaves forwardedProps open-ended. Preserve
	// that extension value from the original document so forwarding does not
	// round large JSON numbers through float64.
	var rawInput struct {
		ForwardedProps jsontext.Value `json:"forwardedProps"`
	}
	if err := json.Unmarshal(payload, &rawInput); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	if len(rawInput.ForwardedProps) > 0 {
		input.ForwardedProps = rawInput.ForwardedProps
	}
	if strings.TrimSpace(input.ThreadID) == "" {
		return nil, fmt.Errorf("%w: threadId is required", ErrInvalidRunInput)
	}
	if strings.TrimSpace(input.RunID) == "" {
		return nil, fmt.Errorf("%w: runId is required", ErrInvalidRunInput)
	}
	return &input, nil
}

// runContent converts the newest turn of an AG-UI request into ADK-Go
// content. It looks at the trailing run of same-role messages rather than
// only the very last message: a resumed run can deliver several tool-result
// messages at once (parallel tool calls), and the newest message is not
// always plain user text — a resumed approval or oralboards answer arrives
// as one or more role:"tool" messages.
func runContent(ctx context.Context, input *types.RunAgentInput, identity auth.Identity, pending PendingTools, scope ToolScope) (*genai.Content, error) {
	if len(input.Resume) > 0 {
		return resumeContent(input.Resume)
	}
	if len(input.Messages) == 0 {
		return nil, nil
	}
	last := input.Messages[len(input.Messages)-1]
	var content *genai.Content
	var err error
	switch last.Role {
	case types.RoleUser:
		content, err = userContent(last)
	case types.RoleTool:
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

// resumeContent translates AG-UI's standard interrupt responses directly to
// the FunctionResponse shape ADK uses to resume workflow RequestInput nodes.
// CopilotKit also appends compatibility tool-result messages, but the resume
// array is authoritative and avoids routing native workflow input through the
// pending frontend-tool store.
func resumeContent(entries []types.ResumeEntry) (*genai.Content, error) {
	parts := make([]*genai.Part, 0, len(entries))
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		interruptID := strings.TrimSpace(entry.InterruptID)
		if interruptID == "" || seen[interruptID] {
			return nil, fmt.Errorf("%w: resume interruptId must be unique and non-empty", ErrInvalidRunInput)
		}
		seen[interruptID] = true

		var response map[string]any
		switch entry.Status {
		case types.ResumeStatusResolved:
			if object, ok := entry.Payload.(map[string]any); ok && object != nil {
				response = make(map[string]any, len(object))
				for key, value := range object {
					if key != "_agui_request" {
						response[key] = value
					}
				}
			} else {
				response = map[string]any{"response": entry.Payload}
			}
		case types.ResumeStatusCancelled:
			response = map[string]any{"status": string(types.ResumeStatusCancelled)}
		default:
			return nil, fmt.Errorf("%w: invalid resume status %q", ErrInvalidRunInput, entry.Status)
		}

		parts = append(parts, &genai.Part{FunctionResponse: &genai.FunctionResponse{
			ID:       interruptID,
			Name:     workflow.WorkflowInputFunctionCallName,
			Response: response,
		}})
	}
	return &genai.Content{Role: genai.RoleUser, Parts: parts}, nil
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
func contextPart(entries []types.Context) *genai.Part {
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

func userContent(msg types.Message) (*genai.Content, error) {
	if text, ok := msg.ContentString(); ok {
		if strings.TrimSpace(text) == "" {
			return nil, fmt.Errorf("%w: user message has no content", ErrInvalidRunInput)
		}
		return &genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{Text: text}}}, nil
	}
	if fragments, ok := msg.ContentInputContents(); ok {
		parts := make([]*genai.Part, 0, len(fragments))
		for _, fragment := range fragments {
			if fragment.Type != types.InputContentTypeText {
				return nil, fmt.Errorf("%w: multimodal user content is not supported", ErrInvalidRunInput)
			}
			if fragment.Text != "" {
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
func toolResultContent(ctx context.Context, messages []types.Message, identity auth.Identity, pending PendingTools, scope ToolScope) (*genai.Content, error) {
	end := len(messages)
	start := end
	for start > 0 && messages[start-1].Role == types.RoleTool {
		start--
	}
	results := make([]PendingToolResult, 0, end-start)
	seen := make(map[string]bool, end-start)
	for _, msg := range messages[start:end] {
		callID := strings.TrimSpace(msg.ToolCallID)
		if !ClientCallID.MatchString(callID) || seen[callID] {
			return nil, fmt.Errorf("%w: tool result call IDs must be valid and unique", ErrInvalidRunInput)
		}
		seen[callID] = true
		payload, err := toolResponsePayload(msg)
		if err != nil {
			return nil, err
		}
		results = append(results, PendingToolResult{CallID: callID, Payload: payload})
	}

	var responses []*genai.FunctionResponse
	if pending != nil {
		claimed, err := pending.ClaimBatch(ctx, identity, scope, results)
		if err != nil {
			return nil, fmt.Errorf("%w: pending tool results were rejected", ErrInvalidRunInput)
		}
		responses = claimed
	} else {
		responses = make([]*genai.FunctionResponse, 0, len(results))
		for _, result := range results {
			name := toolNameFromHistory(messages, result.CallID)
			if !ClientToolName.MatchString(name) {
				return nil, fmt.Errorf("%w: tool result %q has no valid matching tool call", ErrInvalidRunInput, result.CallID)
			}
			var response map[string]any
			if err := json.Unmarshal(result.Payload, &response); err != nil || response == nil {
				return nil, fmt.Errorf("%w: tool result content must be an object", ErrInvalidRunInput)
			}
			responses = append(responses, &genai.FunctionResponse{ID: result.CallID, Name: name, Response: response})
		}
	}
	if len(responses) != len(results) {
		return nil, fmt.Errorf("%w: pending tool results were incomplete", ErrInvalidRunInput)
	}
	parts := make([]*genai.Part, 0, len(responses))
	for _, response := range responses {
		parts = append(parts, &genai.Part{FunctionResponse: response})
	}
	return &genai.Content{Role: genai.RoleUser, Parts: parts}, nil
}

func toolNameFromHistory(history []types.Message, callID string) string {
	for _, msg := range history {
		for _, call := range msg.ToolCalls {
			if call.ID == callID {
				return call.Function.Name
			}
		}
	}
	return ""
}

type textToolResponse struct {
	Result string `json:"result"`
}

func toolResponsePayload(msg types.Message) (jsontext.Value, error) {
	text, ok := msg.ContentString()
	if !ok {
		return nil, fmt.Errorf("%w: tool result content must be a string", ErrInvalidRunInput)
	}
	if strings.TrimSpace(text) == "" {
		return jsontext.Value(`{}`), nil
	}
	payload := jsontext.Value(strings.TrimSpace(text))
	if payload.IsValid() && len(payload) > 0 && payload[0] == '{' {
		return payload, nil
	}
	payload, err := json.Marshal(textToolResponse{Result: text})
	if err != nil {
		return nil, fmt.Errorf("%w: encode tool result content", ErrInvalidRunInput)
	}
	return payload, nil
}
