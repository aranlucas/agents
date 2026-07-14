package presentation

import (
	"context"
	"iter"
	"slices"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestPresentationToolsExposeBulkBuildOnly(t *testing.T) {
	tools, err := presentationTools()
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tools))
	for _, item := range tools {
		names = append(names, item.Name())
	}
	if !slices.Contains(names, "build_presentation") || slices.Contains(names, "create_slide") {
		t.Fatalf("tool names = %v", names)
	}
}

func TestPresentationAgentEmbedsInstructionAndBuilds(t *testing.T) {
	agent, err := New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if agent.Name() != AppName {
		t.Fatalf("name = %q", agent.Name())
	}
	if !strings.Contains(Instruction, "build_presentation") || !strings.Contains(Instruction, "State is the source of truth") {
		t.Fatal("instruction assets are incomplete")
	}
}
