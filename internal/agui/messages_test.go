package agui

import (
	"testing"

	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestPersistedToolHistoryRejectsInvalidOrUnencodableSemantics(t *testing.T) {
	for name, part := range map[string]*genai.Part{
		"empty call name":    {FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "", Args: map[string]any{}}},
		"unencodable call":   {FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "tool", Args: map[string]any{"bad": make(chan int)}}},
		"invalid result ID":  {FunctionResponse: &genai.FunctionResponse{ID: "bad\ncall", Response: map[string]any{}}},
		"unencodable result": {FunctionResponse: &genai.FunctionResponse{ID: "call-1", Response: map[string]any{"bad": make(chan int)}}},
	} {
		t.Run(name, func(t *testing.T) {
			messages, err := eventToMessages(&session.Event{ID: "event-1", Content: &genai.Content{Parts: []*genai.Part{part}}})
			if err == nil || len(messages) != 0 {
				t.Fatalf("eventToMessages() = %#v, %v", messages, err)
			}
		})
	}
}

// Server-side tool names (MCP toolsets, agenttool) need not look like
// identifiers; replay must accept exactly what the live stream accepted.
func TestPersistedServerToolNamesReplayAsToolCalls(t *testing.T) {
	messages, err := eventToMessages(&session.Event{ID: "event-1", Author: "grocery_agent", Content: &genai.Content{Parts: []*genai.Part{{
		FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "mcp:products/search v2", Args: map[string]any{"q": "milk"}},
	}}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || len(messages[0].ToolCalls) != 1 {
		t.Fatalf("messages = %#v", messages)
	}
	if messages[0].ToolCalls[0].Function.Name != "mcp:products/search v2" {
		t.Fatalf("tool call name = %q", messages[0].ToolCalls[0].Function.Name)
	}
}
