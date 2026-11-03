package grocery

import (
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestGroceryContextValidationPreservesOlderConstraints(t *testing.T) {
	request := &model.LLMRequest{}
	for range 60 {
		request.Contents = append(
			request.Contents,
			&genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{Text: strings.Repeat("u", 100)}}},
			&genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{Text: strings.Repeat("m", 100)}}},
		)
	}
	last := request.Contents[len(request.Contents)-1]
	if _, err := validateGroceryContext(nil, request); err != nil {
		t.Fatal(err)
	}
	if len(request.Contents) != 120 || request.Contents[len(request.Contents)-1] != last {
		t.Fatalf("history was truncated: %d contents", len(request.Contents))
	}
}

func TestGroceryContextValidationRejectsOversizedSingleTurn(t *testing.T) {
	request := &model.LLMRequest{Contents: []*genai.Content{{Role: genai.RoleUser, Parts: []*genai.Part{{Text: strings.Repeat("x", (512<<10)+1)}}}}}
	if _, err := validateGroceryContext(nil, request); err == nil {
		t.Fatal("oversized single turn accepted")
	}
}
