package oralboards

import (
	"context"
	"iter"
	"path/filepath"
	"testing"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"
)

type reproModel struct{ name string }

func (m reproModel) Name() string { return m.name }
func (m reproModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: genai.NewContentFromText("hello from "+m.name, genai.RoleModel), TurnComplete: true}, nil)
	}
}

func buildRunner(t *testing.T, seed map[string]any) (*runner.Runner, session.Service) {
	t.Helper()
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })
	models := PhaseModels{CaseBuilder: reproModel{"case"}, Questioner: reproModel{"question"}, Evaluator: reproModel{"evaluate"}, Scorer: reproModel{"score"}}
	built, err := New(models, corpus)
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if seed != nil {
		if _, err := sessions.Create(context.Background(), &session.CreateRequest{AppName: AppName, UserID: "user-1", SessionID: "thread-1", State: seed}); err != nil {
			t.Fatal(err)
		}
	}
	rn, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		t.Fatal(err)
	}
	return rn, sessions
}

func runTurn(t *testing.T, rn *runner.Runner, text string) []*session.Event {
	t.Helper()
	var events []*session.Event
	content := genai.NewContentFromText(text, genai.RoleUser)
	for event, err := range rn.Run(context.Background(), "user-1", "thread-1", content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}) {
		if err != nil {
			t.Fatalf("run error after %d events: %v", len(events), err)
		}
		events = append(events, event)
	}
	return events
}

func resumeTurn(t *testing.T, rn *runner.Runner, interruptID, answer string) []*session.Event {
	t.Helper()
	content := &genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{FunctionResponse: &genai.FunctionResponse{
		ID: interruptID, Name: workflow.WorkflowInputFunctionCallName, Response: map[string]any{"answer": answer},
	}}}}
	var events []*session.Event
	for event, err := range rn.Run(context.Background(), "user-1", "thread-1", content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}) {
		if err != nil {
			t.Fatalf("resume %s failed after %d events: %v", interruptID, len(events), err)
		}
		events = append(events, event)
	}
	return events
}

func requestID(t *testing.T, events []*session.Event, kind string) string {
	t.Helper()
	for _, event := range events {
		if event.RequestedInput != nil {
			return event.RequestedInput.InterruptID
		}
	}
	t.Fatalf("run emitted no %s RequestInput event", kind)
	return ""
}

func sessionState(t *testing.T, sessions session.Service) State {
	t.Helper()
	response, err := sessions.Get(context.Background(), &session.GetRequest{AppName: AppName, UserID: "user-1", SessionID: "thread-1"})
	if err != nil {
		t.Fatal(err)
	}
	return stateFromSession(response.Session.State())
}

func TestReadyRequestResumesAtQuestionerAndPersistsQuestion(t *testing.T) {
	rn, sessions := buildRunner(t, nil)
	readyID := requestID(t, runTurn(t, rn, "Create a case"), "ready")
	resumeTurn(t, rn, readyID, "ready")
	state := sessionState(t, sessions)
	if state.Status != "questioning" {
		t.Fatalf("status = %q, want questioning", state.Status)
	}
	if state.CurrentQuestion != "hello from question" {
		t.Fatalf("current_question = %q, want the questioner's text", state.CurrentQuestion)
	}
}

func TestAnswerRequestResumesAtEvaluator(t *testing.T) {
	rn, sessions := buildRunner(t, nil)
	readyID := requestID(t, runTurn(t, rn, "Create a case"), "ready")
	answerID := requestID(t, resumeTurn(t, rn, readyID, "ready"), "answer")
	events := resumeTurn(t, rn, answerID, "I would perform a pulpotomy given the vital pulp exposure.")
	state := sessionState(t, sessions)
	if state.Status != "feedback" {
		t.Fatalf("status = %q, want feedback (evaluator phase)", state.Status)
	}
	sawEvaluator := false
	for _, event := range events {
		if event.Author == "evaluator" {
			sawEvaluator = true
		}
	}
	if !sawEvaluator {
		t.Fatal("evaluator never ran for the candidate answer")
	}
}

// Drives the oralboards root agent through the ADK runner the way
// internal/agui/handler.go does: a fresh idle session must route to the
// case_builder child and yield its events (guards against the custom
// orchestrator silently producing an empty run).
func TestRunnerRoutesFreshSessionToCaseBuilder(t *testing.T) {
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })
	models := PhaseModels{CaseBuilder: reproModel{"case"}, Questioner: reproModel{"question"}, Evaluator: reproModel{"evaluate"}, Scorer: reproModel{"score"}}
	built, err := New(models, corpus)
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	rn, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		t.Fatal(err)
	}
	content := genai.NewContentFromText("Run a grounded pediatric dentistry oral-board case.", genai.RoleUser)
	count := 0
	for event, err := range rn.Run(context.Background(), "user-1", "thread-1", content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}) {
		if err != nil {
			t.Fatalf("run error after %d events: %v", count, err)
		}
		count++
		t.Logf("event %d: author=%s partial=%v content=%v", count, event.Author, event.Partial, event.Content != nil)
	}
	if count == 0 {
		t.Fatal("runner yielded zero events — reproduces the empty AG-UI run")
	}
}
