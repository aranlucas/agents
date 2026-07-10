package travel

import (
	"context"
	"iter"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestTravelAgentBuildsWithApprovalBoundary(t *testing.T) {
	built, err := New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != AppName {
		t.Fatalf("name = %q", built.Name())
	}
	for _, required := range []string{"request_user_approval", "matching tool result", "Never paste the itinerary"} {
		if !strings.Contains(Instruction, required) {
			t.Fatalf("instruction missing %q", required)
		}
	}
}
