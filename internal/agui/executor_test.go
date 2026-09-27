package agui

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/genai"
)

func TestExecutionRestoresSnapshotWithoutInvokingADK(t *testing.T) {
	execution := runExecution{input: &types.RunAgentInput{ThreadID: "thread", RunID: "run"}, snapshot: stateDocument{}}
	var got []events.EventType
	err := execution.execute(context.Background(), func(_ context.Context, event events.Event) error {
		got = append(got, event.Type())
		return nil
	})
	want := []events.EventType{events.EventTypeRunStarted, events.EventTypeStateSnapshot, events.EventTypeRunFinished}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("events = %v, error = %v", got, err)
	}
}

func TestExecutionStopsBeforeADKWhenSinkFails(t *testing.T) {
	for _, failAt := range []int{1, 2} {
		execution := runExecution{input: &types.RunAgentInput{ThreadID: "thread", RunID: "run"}, content: &genai.Content{}}
		sinkErr := errors.New("durable publication failed")
		calls := 0
		err := execution.execute(context.Background(), func(context.Context, events.Event) error {
			calls++
			if calls == failAt {
				return sinkErr
			}
			return nil
		})
		if !errors.Is(err, sinkErr) || calls != failAt {
			t.Fatalf("calls = %d, error = %v", calls, err)
		}
	}
}

func TestInvalidClientToolsRejectedBeforeRunResources(t *testing.T) {
	for _, tools := range []string{
		`[{"name":"bad name","parameters":{"type":"object"}}]`,
		`[{"name":"same","parameters":{"type":"object"}},{"name":"same","parameters":{"type":"object"}}]`,
		`[{"name":"bad_schema","parameters":{"type":"invalid"}}]`,
	} {
		// Resource dependencies are deliberately absent: malformed declarations
		// must never reach session restoration, run leasing, or pending-tool claims.
		handler := &ADKHandler{}
		body := `{"threadId":"thread","runId":"run","messages":[],"tools":` + tools + `}`
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_agui_input") {
			t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
		}
	}
}
