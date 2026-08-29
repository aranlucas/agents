package agui

import (
	"testing"

	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestUnresolvedSessionInterruptsTracksRequestsUntilTheirResponse(t *testing.T) {
	events := (&fakeSession{events: []*session.Event{
		{RequestedInput: &session.RequestInput{
			InterruptID: "question-1",
			Message:     "What is your diagnosis?",
			Payload:     map[string]any{"kind": "answer", "question": "What is your diagnosis?"},
		}},
		{RequestedInput: &session.RequestInput{
			InterruptID: "question-2",
			Message:     "How would you treat it?",
			Payload:     map[string]any{"kind": "answer", "question": "How would you treat it?"},
		}},
		{Content: &genai.Content{Parts: []*genai.Part{{
			FunctionResponse: &genai.FunctionResponse{ID: "question-1", Name: "adk_request_input"},
		}}}},
	}}).Events()

	interrupts := unresolvedSessionInterrupts(events)
	if len(interrupts) != 1 || interrupts[0].ID != "question-2" {
		t.Fatalf("unresolved interrupts = %#v, want only question-2", interrupts)
	}
	payload, ok := interrupts[0].Metadata["payload"].(map[string]any)
	if !ok || payload["question"] != "How would you treat it?" {
		t.Fatalf("interrupt payload = %#v", interrupts[0].Metadata)
	}
}
