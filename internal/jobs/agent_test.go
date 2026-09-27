package jobs_test

import (
	"context"
	"iter"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/jobs"
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

func TestJobsAgentIsResumeGroundedAndPrivateByInstruction(t *testing.T) {
	built, err := jobs.New(fakeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != jobs.AppName {
		t.Fatalf("name = %q", built.Name())
	}
	for _, required := range []string{
		"Ask DoorDash",
		"save_application_profile",
		"save_job_watchlist",
		"write_ranked_job_inbox",
		"write_match_assessment",
		"write_tailored_resume",
		"voluntary self-identification",
		"Never submit an application",
	} {
		if !strings.Contains(jobs.Instruction, required) {
			t.Errorf("instruction is missing %q", required)
		}
	}
}
