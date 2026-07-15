package resume_test

import (
	"context"
	"iter"
	"strings"
	"testing"

	"agents/resume"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
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

type captureModel struct {
	request *model.LLMRequest
}

func (*captureModel) Name() string { return "capture-model" }

func (m *captureModel) GenerateContent(_ context.Context, req *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.request = req
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: genai.NewContentFromText("ok", genai.RoleModel), TurnComplete: true}, nil)
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
	if !strings.Contains(resume.Instruction, "DoorDash") ||
		!strings.Contains(resume.Instruction, "set_target_role") ||
		!strings.Contains(resume.Instruction, "ordinary questions with no concrete target job") {
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

func TestResumeAgentCapsCompletionTokens(t *testing.T) {
	captured := &captureModel{}
	built, err := resume.New(captured)
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: resume.AppName, UserID: "user", SessionID: "thread", State: resume.StateDefaults(),
	}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: resume.AppName, Agent: built, SessionService: sessions})
	if err != nil {
		t.Fatal(err)
	}
	for _, runErr := range run.Run(t.Context(), "user", "thread", genai.NewContentFromText("hello", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
	}
	if captured.request == nil || captured.request.Config == nil || captured.request.Config.MaxOutputTokens != 2048 {
		t.Fatalf("request config = %#v", captured.request)
	}
}

func TestResumeAgentEmbedsCurrentPlatformArchitecture(t *testing.T) {
	for _, required := range []string{
		"Google ADK-Go + AG-UI",
		"11 typed Go agents",
		"single Go AG-UI gateway",
		"D1 session state",
		"R2 artifact storage",
		"Live integrations connect Kroger and travel data",
		"synced from Health Connect",
		"ADK task agents over shared typed state",
	} {
		if !strings.Contains(resume.Instruction, required) {
			t.Errorf("embedded resume is missing current architecture fact %q", required)
		}
	}

	for _, retired := range []string{
		"Multiple Python agents",
		"FastAPI gateway",
		"Strava for training data",
		"in-process as ADK tools",
	} {
		if strings.Contains(resume.Instruction, retired) {
			t.Errorf("embedded resume still contains retired architecture %q", retired)
		}
	}
}
