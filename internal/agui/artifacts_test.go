package agui

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

// artifactSaveModel mirrors fakeModel for the save_report tool: the first
// turn asks to call it, the second streams a confirmation.
type artifactSaveModel struct{}

func (m *artifactSaveModel) Name() string { return "fake-artifact-model" }

func (m *artifactSaveModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if hasFunctionResponse(req.Contents) {
			yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Saved."}}}, TurnComplete: true}, nil)
			return
		}
		yield(&model.LLMResponse{
			Content: &genai.Content{Role: "model", Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-artifact-1", Name: "save_report", Args: map[string]any{"title": "weekly"}},
			}}},
			TurnComplete: true,
		}, nil)
	}
}

type artifactSaveArgs struct {
	Title string `json:"title"`
}

type artifactSaveResult struct {
	OK      bool  `json:"ok"`
	Version int64 `json:"version"`
}

// saveReportTool saves through the invocation context's Artifacts() and
// records what it saw, so tests can assert on the runner wiring.
func saveReportTool(sawArtifacts *bool, savedVersion *int64) tool.Tool {
	t, err := functiontool.New[artifactSaveArgs, artifactSaveResult](functiontool.Config{
		Name:        "save_report",
		Description: "Save a report as a session artifact.",
	}, func(ctx agent.Context, args artifactSaveArgs) (artifactSaveResult, error) {
		artifacts := ctx.Artifacts()
		if artifacts == nil {
			*sawArtifacts = false
			return artifactSaveResult{OK: true}, nil
		}
		*sawArtifacts = true
		response, err := artifacts.Save(ctx, "report.txt", &genai.Part{Text: "report: " + args.Title})
		if err != nil {
			return artifactSaveResult{}, err
		}
		*savedVersion = response.Version
		return artifactSaveResult{OK: true, Version: response.Version}, nil
	})
	if err != nil {
		panic(err)
	}
	return t
}

func newArtifactAgent(t *testing.T, sawArtifacts *bool, savedVersion *int64) agent.Agent {
	t.Helper()
	a, err := llmagent.New(llmagent.Config{
		Name:        "resume_agent",
		Instruction: "test artifact agent",
		Model:       &artifactSaveModel{},
		Tools:       []tool.Tool{saveReportTool(sawArtifacts, savedVersion)},
	})
	if err != nil {
		t.Fatalf("build agent: %v", err)
	}
	return a
}

func runArtifactTurn(t *testing.T, handler http.Handler, threadID string) string {
	t.Helper()
	body := `{"threadId":"` + threadID + `","runId":"run-` + threadID + `","state":{},"messages":[{"id":"user-1","role":"user","content":"save it"}],"tools":[],"context":[],"forwardedProps":null}`
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	out := rr.Body.String()
	if rr.Code != http.StatusOK || strings.Contains(out, "RUN_ERROR") || !strings.Contains(out, "RUN_FINISHED") {
		t.Fatalf("artifact stream = %d %s", rr.Code, out)
	}
	return out
}

func TestHandlerWiresArtifactServiceIntoRunner(t *testing.T) {
	artifacts := artifact.InMemoryService()
	sawArtifacts, savedVersion := false, int64(0)
	handler, err := NewEntryHandler(agentruntime.Entry{
		Route: "resume", AppName: "resume_agent", Agent: newArtifactAgent(t, &sawArtifacts, &savedVersion),
		Public: true, Timeout: 5 * time.Second,
	}, newFakeSessionService(),
		WithIDGenerator(&fakeIDs{}),
		WithTextStreamSmoothing(false, streamChunkingWord, 0, 0),
		WithArtifacts(artifacts))
	if err != nil {
		t.Fatal(err)
	}

	runArtifactTurn(t, handler, "thread-artifact")

	if !sawArtifacts || savedVersion != 1 {
		t.Fatalf("tool artifacts: saw=%v version=%d", sawArtifacts, savedVersion)
	}
	loaded, err := artifacts.Load(t.Context(), &artifact.LoadRequest{
		AppName: "resume_agent", UserID: "anon:thread-artifact", SessionID: "thread-artifact", FileName: "report.txt",
	})
	if err != nil {
		t.Fatalf("load artifact: %v", err)
	}
	if loaded.Part.Text != "report: weekly" {
		t.Fatalf("artifact text = %q", loaded.Part.Text)
	}
}

func TestStatelessHandlerDropsArtifactService(t *testing.T) {
	sawArtifacts, savedVersion := true, int64(0)
	handler, err := NewStatelessEntryHandler(agentruntime.Entry{
		Route: "resume", AppName: "resume_agent", Agent: newArtifactAgent(t, &sawArtifacts, &savedVersion),
		Public: true, Timeout: 5 * time.Second,
	}, WithIDGenerator(&fakeIDs{}), WithArtifacts(artifact.InMemoryService()))
	if err != nil {
		t.Fatal(err)
	}

	runArtifactTurn(t, handler, "thread-suggest")

	if sawArtifacts || savedVersion != 0 {
		t.Fatalf("stateless tool artifacts: saw=%v version=%d", sawArtifacts, savedVersion)
	}
}
