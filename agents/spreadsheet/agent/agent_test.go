package spreadsheet

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

func TestSpreadsheetAgentBuildsWithEmbeddedStateContract(t *testing.T) {
	agent, err := New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if agent.Name() != AppName {
		t.Fatalf("name=%q", agent.Name())
	}
	if !strings.Contains(Instruction, "State is the source of truth") {
		t.Fatal("state contract missing")
	}
}
