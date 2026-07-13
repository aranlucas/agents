package research

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

func TestResearchAgentEmbedsCutoffDisclaimer(t *testing.T) {
	agent, err := New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if agent.Name() != AppName {
		t.Fatalf("name=%q", agent.Name())
	}
	if !strings.Contains(Instruction, "early 2025") || !strings.Contains(Instruction, "does not have live internet") {
		t.Fatal("cutoff disclaimer missing")
	}
	if !strings.Contains(Instruction, "final state mutation") || !strings.Contains(Instruction, "do not call\n   `write_report`") || !strings.Contains(Instruction, "must never be batched") {
		t.Fatal("ready-state sequencing guidance missing")
	}
}
