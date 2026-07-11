package resume_test

import (
	"context"
	"iter"
	"strings"
	"testing"

	"agents/resume/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// fakeModel is a minimal model.LLM double: resume.New only needs a value
// satisfying the interface, it never calls GenerateContent in this test.
type fakeModel struct{}

func (fakeModel) Name() string { return "fake-model" }

func (fakeModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "ok"}}}, TurnComplete: true}, nil)
	}
}

func TestResumeAgentEmbedsGroundingAndDefaults(t *testing.T) {
	ag, err := resume.New(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if ag.Name() != "resume_agent" {
		t.Fatalf("name = %q", ag.Name())
	}
	if !strings.Contains(resume.Instruction, "DoorDash") {
		t.Fatal("resume grounding was not embedded")
	}
}

func TestResumeAgentRejectsNilModel(t *testing.T) {
	// llmagent.New itself accepts a nil model.LLM at construction time (the
	// nil is only dereferenced when a run actually calls GenerateContent),
	// so this documents that resume.New does not add its own validation —
	// callers (cmd/gateway) are responsible for passing a configured model.
	ag, err := resume.New(nil)
	if err != nil {
		t.Fatalf("New(nil) error = %v", err)
	}
	if ag == nil {
		t.Fatal("New(nil) returned a nil agent")
	}
}
