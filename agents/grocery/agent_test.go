package grocery

import (
	"context"
	"iter"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestGroceryAgentBuildsWithAuthContract(t *testing.T) {
	built, err := New(fakeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"Kroger needs to be", "three total read-only Kroger calls", "set_product_matches", "never invent or reconstruct image URLs", "never retry", "show_product_results", "do not repeat its product details"} {
		if built.Name() != AppName || !strings.Contains(Instruction, required) {
			t.Fatalf("agent/instruction missing %q", required)
		}
	}
	if strings.Contains(Instruction, "request_user_approval") || strings.Contains(Instruction, "approval") {
		t.Fatal("grocery instructions still request approval")
	}
}

func TestGroceryContextCompactionKeepsRecentSafeTurnBoundary(t *testing.T) {
	request := &model.LLMRequest{}
	for index := 0; index < 60; index++ {
		request.Contents = append(
			request.Contents,
			&genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{Text: strings.Repeat("u", 100)}}},
			&genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{Text: strings.Repeat("m", 100)}}},
		)
	}
	last := request.Contents[len(request.Contents)-1]
	if _, err := compactGroceryContext(nil, request); err != nil {
		t.Fatal(err)
	}
	if len(request.Contents) > 40 || request.Contents[0].Role != genai.RoleUser || request.Contents[len(request.Contents)-1] != last {
		t.Fatalf("compacted contents = %d, first=%q", len(request.Contents), request.Contents[0].Role)
	}
}

func TestGroceryContextCompactionRejectsOversizedSingleTurn(t *testing.T) {
	request := &model.LLMRequest{Contents: []*genai.Content{{Role: genai.RoleUser, Parts: []*genai.Part{{Text: strings.Repeat("x", (512<<10)+1)}}}}}
	if _, err := compactGroceryContext(nil, request); err == nil {
		t.Fatal("oversized single turn accepted")
	}
}
