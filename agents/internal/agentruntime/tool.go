package agentruntime

// StructuredError is safe for both tool results and AG-UI error events.
type StructuredError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
