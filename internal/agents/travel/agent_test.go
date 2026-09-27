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

func TestTravelAgentBuildsWithBookingTools(t *testing.T) {
	built, err := New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != AppName {
		t.Fatalf("name = %q", built.Name())
	}
	normalized := strings.Join(strings.Fields(Instruction), " ")
	for _, required := range []string{
		"Never paste the itinerary",
		"at most three read-only TRVL",
		"Do not search flights, hotels, prices, or availability unless the user explicitly asks for them",
		"mark it ready in the same turn",
	} {
		if !strings.Contains(normalized, required) {
			t.Fatalf("instruction missing %q", required)
		}
	}
	if strings.Contains(Instruction, "request_user_approval") || strings.Contains(Instruction, "approval") {
		t.Fatal("travel instructions still request approval")
	}
}
