package agui

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/genai"
)

func TestBuildClientToolsPreservesDynamicSchemaAndLongRunningMarker(t *testing.T) {
	pending := newFakePending()
	tools, err := buildClientTools([]types.Tool{{Name: "choose_flight", Description: "Choose a flight", Parameters: map[string]any{
		"type": "object", "properties": map[string]any{"flight_id": map[string]any{"type": "string"}}, "required": []string{"flight_id"},
	}}}, pending)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 1 {
		t.Fatalf("tools = %#v", tools)
	}
	if !tools[0].IsLongRunning() || tools[0].Name() != "choose_flight" {
		t.Fatalf("tool = %#v", tools[0])
	}
	declarer, ok := tools[0].(interface {
		Declaration() *genai.FunctionDeclaration
	})
	if !ok {
		t.Fatal("tool has no declaration")
	}
	encoded, _ := json.Marshal(declarer.Declaration().ParametersJsonSchema)
	if !strings.Contains(string(encoded), "flight_id") {
		t.Fatalf("schema = %s", encoded)
	}
	encoded, _ = json.Marshal(declarer.Declaration().ResponseJsonSchema)
	if !strings.Contains(string(encoded), `"status"`) || !strings.Contains(string(encoded), `"call_id"`) {
		t.Fatalf("result schema = %s", encoded)
	}
	if _, err := buildClientTools([]types.Tool{{Name: "choose_flight"}, {Name: "choose_flight"}}, pending); err == nil {
		t.Fatal("duplicate tool accepted")
	}
}
