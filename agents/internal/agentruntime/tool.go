package agentruntime

import (
	"errors"

	"google.golang.org/adk/tool"
)

// StructuredError is safe for both tool results and AG-UI error events.
type StructuredError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ToolResult gives every state tool a stable success/error envelope.
type ToolResult struct {
	OK    bool             `json:"ok"`
	Error *StructuredError `json:"error,omitempty"`
}

func Success() ToolResult { return ToolResult{OK: true} }
func Failure(code, message string) ToolResult {
	return ToolResult{Error: &StructuredError{Code: code, Message: message}}
}

// Commit applies a successful transaction to the invocation event delta.
func Commit(ctx tool.Context, transaction *Transaction) error {
	if ctx == nil || transaction == nil {
		return errors.New("tool context and transaction are required")
	}
	actions := ctx.Actions()
	if actions == nil {
		return errors.New("tool actions are unavailable")
	}
	if actions.StateDelta == nil {
		actions.StateDelta = make(map[string]any)
	}
	for key, value := range transaction.Changes() {
		actions.StateDelta[key] = value
	}
	return nil
}
