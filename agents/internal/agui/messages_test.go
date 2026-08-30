package agui

import (
	"testing"

	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestPersistedToolHistoryRejectsInvalidOrUnencodableSemantics(t *testing.T) {
	for name, part := range map[string]*genai.Part{
		"invalid call name":  {FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "bad name", Args: map[string]any{}}},
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
