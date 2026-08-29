package agui

import (
	"context"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type interruptResponse struct {
	Answer string `json:"answer"`
}

func TestConverterCapturesNativeRequestInputAsStandardInterrupt(t *testing.T) {
	responseSchema, err := jsonschema.For[interruptResponse](nil)
	if err != nil {
		t.Fatal(err)
	}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, nil, ToolScope{}, nil, streamSmoothing{})

	converter.Convert(&session.Event{RequestedInput: &session.RequestInput{
		InterruptID:    "oralboards-ready-1",
		Message:        "Ready to begin?",
		ResponseSchema: responseSchema,
		Payload: map[string]any{
			"kind": "ready", "question": "Ready to begin?",
		},
	}})

	interrupts := converter.Interrupts()
	if len(interrupts) != 1 {
		t.Fatalf("interrupts = %#v, want one", interrupts)
	}
	interrupt := interrupts[0]
	if interrupt.ID != "oralboards-ready-1" || interrupt.ToolCallID != interrupt.ID || interrupt.Reason != "tool_call" {
		t.Fatalf("interrupt identity = %#v", interrupt)
	}
	payload, ok := interrupt.Metadata["payload"].(map[string]any)
	if !ok || payload["kind"] != "ready" {
		t.Fatalf("interrupt metadata = %#v", interrupt.Metadata)
	}
	if interrupt.ResponseSchema["type"] != "object" {
		t.Fatalf("response schema = %#v", interrupt.ResponseSchema)
	}
}

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
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{"highlight_row": true}, streamSmoothing{})

	event := &session.Event{
		Content: &genai.Content{Parts: []*genai.Part{{
			FunctionCall: &genai.FunctionCall{ID: "call-highlight-1", Name: "highlight_row", Args: map[string]any{"row": "42"}},
		}}},
		TurnComplete: true,
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
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{"highlight_row": true}, streamSmoothing{})

	event := &session.Event{
		Content: &genai.Content{Parts: []*genai.Part{{
			FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "remember_fact", Args: map[string]any{"note": "blue"}},
		}}},
		TurnComplete: true,
	}

	converter.Convert(event)

	if _, ok := pending.pending[key(scope, "call-1")]; ok {
		t.Fatal("remember_fact is not a declared client tool and must not be registered")
	}
}

func TestConverterSplitsPartialTextIntoChunks(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{}, streamSmoothing{enabled: true, charsPerChunk: 4, chunking: streamChunkingChar})

	event := &session.Event{Partial: true, Content: &genai.Content{Parts: []*genai.Part{{Text: "hello world"}}}}

	out := converter.Convert(event)
	// 1 start event + 3 content chunks for 4/4/3 rune split.
	if len(out) != 4 {
		t.Fatalf("expected 4 chunks events, got %d", len(out))
	}
}

func TestConverterSkipsChunkingWhenDisabled(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{}, streamSmoothing{enabled: false, charsPerChunk: 4, chunking: streamChunkingChar})

	event := &session.Event{Partial: true, Content: &genai.Content{Parts: []*genai.Part{{Text: "hello world"}}}}

	out := converter.Convert(event)
	// 1 start event + 1 content event when smoothing is disabled.
	if len(out) != 2 {
		t.Fatalf("expected 2 events, got %d", len(out))
	}
}

func TestConverterCanSplitTextByWords(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{}, streamSmoothing{enabled: true, chunking: streamChunkingWord})

	event := &session.Event{Partial: true, Content: &genai.Content{Parts: []*genai.Part{{Text: "Hello  world"}}}}

	out := converter.Convert(event)
	if len(out) != 4 {
		t.Fatalf("expected 4 events (start + word + spaces + word), got %d", len(out))
	}
	if out[1].Type() != events.EventTypeTextMessageContent {
		t.Fatalf("expected chunk event at index 1, got %s", out[1].Type())
	}
}

func TestConverterCanSplitTextByLines(t *testing.T) {
	pending := newFakePending()
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-1", ThreadID: "thread-1"}
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, pending, scope, map[string]bool{}, streamSmoothing{enabled: true, chunking: streamChunkingLine})

	event := &session.Event{Partial: true, Content: &genai.Content{Parts: []*genai.Part{{Text: "line1\nline2\nline3"}}}}

	out := converter.Convert(event)
	// 1 start + 3 lines.
	if len(out) != 4 {
		t.Fatalf("expected 4 events, got %d", len(out))
	}
}
