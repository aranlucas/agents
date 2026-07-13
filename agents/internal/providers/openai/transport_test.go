package openai

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/openai/openai-go/v3"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestBuildRequestLeavesParallelToolCallsToProvider(t *testing.T) {
	req := &model.LLMRequest{Config: &genai.GenerateContentConfig{Tools: []*genai.Tool{{
		FunctionDeclarations: []*genai.FunctionDeclaration{{
			Name:       "write_state",
			Parameters: &genai.Schema{Type: genai.TypeObject},
		}},
	}}}}
	params, err := buildRequest(req, "some-model", true)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), `"parallel_tool_calls"`) {
		t.Fatalf("request overrides provider parallel tool-call behavior: %s", encoded)
	}
}

func TestChoiceToContentPreservesProviderParallelToolCalls(t *testing.T) {
	content, err := choiceToContent(openai.ChatCompletionChoice{Message: openai.ChatCompletionMessage{
		ToolCalls: []openai.ChatCompletionMessageToolCallUnion{
			{ID: "call-1", Type: "function", Function: openai.ChatCompletionMessageFunctionToolCallFunction{Name: "first", Arguments: `{"value":1}`}},
			{ID: "call-2", Type: "function", Function: openai.ChatCompletionMessageFunctionToolCallFunction{Name: "second", Arguments: `{"value":2}`}},
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(content.Parts) != 2 || content.Parts[0].FunctionCall == nil || content.Parts[1].FunctionCall == nil {
		t.Fatalf("content parts = %#v", content.Parts)
	}
	if call := content.Parts[0].FunctionCall; call.ID != "call-1" || call.Name != "first" || call.Args["value"] != float64(1) {
		t.Fatalf("function call = %#v", call)
	}
	if call := content.Parts[1].FunctionCall; call.ID != "call-2" || call.Name != "second" || call.Args["value"] != float64(2) {
		t.Fatalf("function call = %#v", call)
	}
}

func TestBuildRequestNormalizesNullableToolSchemaOnly(t *testing.T) {
	nullable := &jsonschema.Schema{
		Type: "object",
		Properties: map[string]*jsonschema.Schema{
			"items": {
				Types: []string{"null", "array"},
				Items: &jsonschema.Schema{Types: []string{"null", "string"}},
			},
		},
	}
	req := &model.LLMRequest{Config: &genai.GenerateContentConfig{
		Tools: []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{{
			Name:                 "write_items",
			ParametersJsonSchema: nullable,
		}}}},
		ResponseJsonSchema: nullable,
	}}
	params, err := buildRequest(req, "some-model", false)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatal(err)
	}
	tools := payload["tools"].([]any)
	function := tools[0].(map[string]any)["function"].(map[string]any)
	parameters := function["parameters"].(map[string]any)
	items := parameters["properties"].(map[string]any)["items"].(map[string]any)
	if items["type"] != "array" || items["items"].(map[string]any)["type"] != "string" {
		t.Fatalf("tool schema = %#v", parameters)
	}
	response := payload["response_format"].(map[string]any)["json_schema"].(map[string]any)["schema"].(map[string]any)
	responseItems := response["properties"].(map[string]any)["items"].(map[string]any)
	if got, ok := responseItems["type"].([]any); !ok || len(got) != 2 || got[0] != "null" || got[1] != "array" {
		t.Fatalf("response schema lost nullability: %#v", response)
	}
}

// A thinking-enabled Gemini phase can emit a bare ThoughtSignature part
// (Thought: false, no Text/FunctionCall/FunctionResponse) alongside its
// thought summary. ADK's cross-agent history conversion
// (llminternal.ConvertForeignEvent) passes any part that isn't
// text/function-call/function-response through unmodified, so this
// signature-only part reaches a sibling phase's request untouched. It must
// be dropped, not treated as an unsupported content part.
func TestBuildRequestDropsThoughtSignatureOnlyPart(t *testing.T) {
	req := &model.LLMRequest{
		Contents: []*genai.Content{
			{Role: "user", Parts: []*genai.Part{
				{Text: "For context:"},
				{ThoughtSignature: []byte{0x01, 0x02, 0x03}},
				{Text: "[case_builder] said: done"},
			}},
		},
	}
	if _, err := buildRequest(req, "some-model", false); err != nil {
		t.Fatalf("buildRequest returned error for a thought-signature-only part: %v", err)
	}
}

func TestContentMessagesRejectsGenuinelyUnsupportedPart(t *testing.T) {
	content := &genai.Content{Role: "user", Parts: []*genai.Part{
		{FileData: &genai.FileData{FileURI: "gs://bucket/object", MIMEType: "application/pdf"}},
	}}
	if _, err := contentMessages(content); err == nil {
		t.Fatal("expected an error for a part with no representable content")
	}
}
