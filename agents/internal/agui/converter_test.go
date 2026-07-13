package agui

import (
	"context"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// TestConverterRegistersClientToolCallBeforeReturningToolCallEvents proves
// the ordering half of Finding 1: toolCallEvents registers a client tool
// call in the PendingStore before it returns the TOOL_CALL_* events that
// describe it. The handler only writes/flushes SSE frames after Convert
// returns its full event slice (see handler.go's run loop), so this
// ordering guarantees no TOOL_CALL_START frame ever reaches the client
// before the pending call exists server-side — otherwise a client that
// resolves the call instantly could race the client proxy tool's own (later)
// Register call and get ErrPendingToolNotFound.
func TestConverterRegistersClientToolCallBeforeReturningToolCallEvents(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{"highlight_row": true})

	event := &session.Event{
		LLMResponse: model.LLMResponse{
			Content: &genai.Content{Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-highlight-1", Name: "highlight_row", Args: map[string]any{"row": "42"}},
			}}},
			TurnComplete: true,
		},
	}

	out := converter.Convert(event)

	record, ok := pending.pending[key(scope, "call-highlight-1")]
	if !ok {
		t.Fatalf("expected call-highlight-1 to be registered before Convert returned; events=%#v", out)
	}
	if string(record.args) != `{"row":"42"}` {
		t.Fatalf("registered args = %s", record.args)
	}
	if len(out) != 3 {
		t.Fatalf("expected TOOL_CALL_START/ARGS/END, got %#v", out)
	}
}

// TestConverterDoesNotRegisterNonClientToolCalls proves the other half:
// an ordinary (non-client, e.g. static ADK) tool call must not be
// registered in the PendingStore just because a converter happens to
// have one configured.
func TestConverterDoesNotRegisterNonClientToolCalls(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{"highlight_row": true})

	event := &session.Event{
		LLMResponse: model.LLMResponse{
			Content: &genai.Content{Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "remember_fact", Args: map[string]any{"note": "blue"}},
			}}},
			TurnComplete: true,
		},
	}

	converter.Convert(event)

	if _, ok := pending.pending[key(scope, "call-1")]; ok {
		t.Fatal("remember_fact is not a declared client tool and must not be registered")
	}
}
