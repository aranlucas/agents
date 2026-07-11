package agui

import (
	"encoding/json"
	"strings"
	"testing"

	"google.golang.org/genai"
)

func TestClientToolsetPreservesDynamicSchemaAndLongRunningMarker(t *testing.T) {
	pending := newFakePending()
	toolset, err := NewClientToolset([]ClientTool{{Name: "choose_flight", Description: "Choose a flight", Parameters: map[string]any{
		"type": "object", "properties": map[string]any{"flight_id": map[string]any{"type": "string"}}, "required": []string{"flight_id"},
	}}}, pending)
	if err != nil {
		t.Fatal(err)
	}
	tools, err := toolset.Tools(nil)
	if err != nil || len(tools) != 1 {
		t.Fatalf("Tools() = %#v, %v", tools, err)
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
	if _, err := NewClientToolset([]ClientTool{{Name: "choose_flight"}, {Name: "choose_flight"}}, pending); err == nil {
		t.Fatal("duplicate tool accepted")
	}
}
