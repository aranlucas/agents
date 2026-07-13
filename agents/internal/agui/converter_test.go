package agui

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestConverterEmitsMCPAppActivityWithoutStateDelta(t *testing.T) {
	converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, nil, ToolScope{}, nil)
	event := &session.Event{Actions: session.EventActions{StateDelta: map[string]any{
		"temp:mcp_app_activity:call-1": map[string]any{
			"messageId": "call-1",
			"content":   map[string]any{"resourceUri": "ui://excalidraw/mcp-app.html", "serverId": "excalidraw"},
		},
	}}}

	out := converter.Convert(event)
	if len(out) != 1 {
		t.Fatalf("events = %#v", out)
	}
	activity, ok := out[0].(*events.ActivitySnapshotEvent)
	if !ok || activity.ActivityType != "mcp-apps" || activity.MessageID != "call-1" {
		t.Fatalf("activity = %#v", out[0])
	}
	if _, ok := activity.Content.(json.RawMessage); !ok {
		t.Fatalf("activity content type = %T, want json.RawMessage", activity.Content)
	}
	encoded, err := json.Marshal(activity.Content)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"resourceUri":"ui://excalidraw/mcp-app.html","serverId":"excalidraw"}` {
		t.Fatalf("activity content was double encoded: %s", encoded)
	}
	if strings.Contains(string(encoded), "temp:mcp_app_activity") {
		t.Fatalf("temporary state leaked: %s", encoded)
	}
}

func TestConverterRejectsInvalidOrNullActivityContent(t *testing.T) {
	for name, content := range map[string]json.RawMessage{"invalid": json.RawMessage(`{`), "null": json.RawMessage(`null`)} {
		t.Run(name, func(t *testing.T) {
			converter := newStreamConverter(context.Background(), &fakeIDs{}, nil, nil, ToolScope{}, nil)
			event := &session.Event{Actions: session.EventActions{StateDelta: map[string]any{
				"temp:mcp_app_activity:call-1": mcpAppActivity{MessageID: "call-1", Content: content},
			}}}
			if out := converter.Convert(event); len(out) != 0 {
				t.Fatalf("events = %#v", out)
			}
		})
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
