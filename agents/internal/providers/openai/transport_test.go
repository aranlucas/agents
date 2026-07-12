package openai

import (
	"encoding/json"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestBuildRequestDisablesParallelToolCalls(t *testing.T) {
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
	if !strings.Contains(string(encoded), `"parallel_tool_calls":false`) {
		t.Fatalf("request does not disable parallel tool calls: %s", encoded)
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
