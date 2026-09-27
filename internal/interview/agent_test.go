package interview_test

import (
	"context"
	"iter"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/interview"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake-model" }

func (fakeModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: genai.NewContentFromText("ok", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func TestAgentBuildsWithInterviewSafetyRules(t *testing.T) {
	built, err := interview.New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != interview.AppName {
		t.Fatalf("name = %q, want %q", built.Name(), interview.AppName)
	}
	for _, required := range []string{
		"configure_interview",
		"select_question",
		"record_attempt_feedback",
		"request_hint",
		"Never claim it compiled, ran, or passed tests",
		"Never invent employers, achievements, metrics",
		"Never propose fictional numbers",
		"Never bypass these tools to score or summarize directly in chat",
		"STRICTLY SEQUENTIAL TOOLING",
		"If any tool response has ok false",
	} {
		if !strings.Contains(interview.Instruction, required) {
			t.Errorf("instruction is missing %q", required)
		}
	}
}
