package fitness

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

func TestFitnessAgentBuildsWithHealthDataGate(t *testing.T) {
	built, err := New(fakeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != AppName || !strings.Contains(Instruction, "connect Health Connect") {
		t.Fatalf("agent/instruction = %q / %q", built.Name(), Instruction)
	}
}
