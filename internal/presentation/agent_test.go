package presentation

import (
	"context"
	"iter"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/bravesearch"
	"google.golang.org/adk/v2/model"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestPresentationToolsExposeOnlyAtomicMutationTools(t *testing.T) {
	tools, err := presentationTools(nil)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tools))
	for _, item := range tools {
		names = append(names, item.Name())
	}
	if !slices.Equal(names, []string{"build_presentation", "revise_presentation"}) {
		t.Fatalf("tool names = %v", names)
	}
}

func TestPresentationToolsExposeWebSearchWhenConfigured(t *testing.T) {
	server := httptest.NewServer(nil)
	t.Cleanup(server.Close)
	search, err := bravesearch.New(server.Client(), server.URL, "test-key", 10)
	if err != nil {
		t.Fatal(err)
	}
	tools, err := presentationTools(search)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tools))
	for _, item := range tools {
		names = append(names, item.Name())
	}
	if !slices.Equal(names, []string{"build_presentation", "revise_presentation", "web_search"}) {
		t.Fatalf("tool names = %v", names)
	}
}

func TestPresentationAgentEmbedsInstructionAndBuilds(t *testing.T) {
	agent, err := New(fakeModel{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if agent.Name() != AppName {
		t.Fatalf("name = %q", agent.Name())
	}
	if !strings.Contains(Instruction, "build_presentation") || !strings.Contains(Instruction, "revise_presentation") || !strings.Contains(Instruction, "web_search") || !strings.Contains(Instruction, "including the title slide") || !strings.Contains(Instruction, "updated_slide_count") || !strings.Contains(Instruction, "State is the source of truth") {
		t.Fatal("instruction assets are incomplete")
	}
}
