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
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
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

func sessionState(t *testing.T, sessions session.Service) State {
	t.Helper()
	response, err := sessions.Get(context.Background(), &session.GetRequest{AppName: AppName, UserID: "user-1", SessionID: "thread-1"})
	if err != nil {
		t.Fatal(err)
	}
	return stateFromSession(response.Session.State())
}

func presentingSeed() map[string]any {
	seed := StateDefaults()
	seed["status"] = "presenting"
	seed["case"] = "A 5-year-old presents with a carious primary molar."
	seed["case_passages"] = "passage"
	return seed
}

// The web client cannot write agent state through the gateway (the AG-UI
// handler ignores RunAgentInput.state by design), so the orchestrator itself
// must drive the exam transitions the UI used to perform client-side:
// "ready" while presenting starts questioning, and a candidate answer while
// questioning moves to feedback so the evaluator runs.
func TestReadyMessageStartsQuestioningAndPersistsQuestion(t *testing.T) {
	rn, sessions := buildRunner(t, presentingSeed())
	runTurn(t, rn, "ready")
	state := sessionState(t, sessions)
	if state.Status != "questioning" {
		t.Fatalf("status = %q, want questioning", state.Status)
	}
	if state.CurrentQuestion != "hello from question" {
		t.Fatalf("current_question = %q, want the questioner's text", state.CurrentQuestion)
	}
}

func TestAnswerWhileQuestioningRoutesToEvaluator(t *testing.T) {
	seed := presentingSeed()
	seed["status"] = "questioning"
	seed["current_question"] = "What is your diagnosis?"
	rn, sessions := buildRunner(t, seed)
	events := runTurn(t, rn, "I would perform a pulpotomy given the vital pulp exposure.")
	state := sessionState(t, sessions)
	if state.Status != "feedback" {
		t.Fatalf("status = %q, want feedback (evaluator phase)", state.Status)
	}
	sawEvaluator := false
	for _, event := range events {
		if event.Author == "evaluator" {
			sawEvaluator = true
		}
		if event.Author == "questioner" {
			t.Fatalf("answer was routed to the questioner: %+v", event)
		}
	}
	if !sawEvaluator {
		t.Fatal("evaluator never ran for the candidate answer")
	}
}

// scriptedModel yields one canned response per call, then repeats the last.
type scriptedModel struct {
	name  string
	calls *int
	turns []*model.LLMResponse
}

func (m scriptedModel) Name() string { return m.name }
func (m scriptedModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		index := *m.calls
		if index >= len(m.turns) {
			index = len(m.turns) - 1
		}
		*m.calls++
		yield(m.turns[index], nil)
	}
}

// A questioner that surfaces the question through the ask_question client
// tool and then narrates its completion must persist the tool's question
// argument — not the trailing narration — into current_question.
func TestQuestionerPersistsAskQuestionArgumentNotNarration(t *testing.T) {
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })
	calls := 0
	questioner := scriptedModel{name: "question", calls: &calls, turns: []*model.LLMResponse{
		{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "ask_question", Args: map[string]any{"kind": "ready", "question": "What is your emergency management plan?"}}}}}, TurnComplete: true},
		{Content: genai.NewContentFromText("The questioner phase is complete. Summary of what was accomplished: ...", genai.RoleModel), TurnComplete: true},
	}}
	models := PhaseModels{CaseBuilder: reproModel{"case"}, Questioner: questioner, Evaluator: reproModel{"evaluate"}, Scorer: reproModel{"score"}}
	built, err := New(models, corpus, stubToolset{})
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if _, err := sessions.Create(context.Background(), &session.CreateRequest{AppName: AppName, UserID: "user-1", SessionID: "thread-1", State: presentingSeed()}); err != nil {
		t.Fatal(err)
	}
	rn, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		t.Fatal(err)
	}
	runTurn(t, rn, "ready")
	state := sessionState(t, sessions)
	if state.CurrentQuestion != "What is your emergency management plan?" {
		t.Fatalf("current_question = %q, want the ask_question argument", state.CurrentQuestion)
	}
}

// stubToolset exposes an ask_question tool the way the AG-UI client toolset
// does, so scripted models can call it in tests.
type stubToolset struct{}

func (stubToolset) Name() string { return "stub_client_tools" }

func (stubToolset) Tools(agent.ReadonlyContext) ([]tool.Tool, error) {
	type askArgs struct {
		Kind     string `json:"kind"`
		Question string `json:"question"`
	}
	type askResult struct {
		Result string `json:"result"`
	}
	asked, err := functiontool.New(functiontool.Config{Name: "ask_question", Description: "Display the current question."}, func(agent.Context, askArgs) (askResult, error) {
		return askResult{Result: "Question is displayed in the exam panel"}, nil
	})
	if err != nil {
		return nil, err
	}
	return []tool.Tool{asked}, nil
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
