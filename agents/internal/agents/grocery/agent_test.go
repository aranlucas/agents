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

func TestGroceryAgentBuildsWithAuthAndApprovalContracts(t *testing.T) {
	built, err := New(fakeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"connect\nKroger first", "checkout_shopping_list", "exact\nremote tool name"} {
		if built.Name() != AppName || !strings.Contains(Instruction, required) {
			t.Fatalf("agent/instruction missing %q", required)
		}
	}
}

func TestGroceryContextCompactionKeepsRecentSafeTurnBoundary(t *testing.T) {
	request := &model.LLMRequest{}
	for index := 0; index < 60; index++ {
		request.Contents = append(request.Contents,
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
