package oralboards

import (
	"context"
	"iter"
	"path/filepath"
	"sync"
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

type sequenceModel struct {
	mu        sync.Mutex
	responses []*model.LLMResponse
	requests  []*model.LLMRequest
	calls     int
}

func (m *sequenceModel) Name() string { return "sequence" }

func (m *sequenceModel) GenerateContent(_ context.Context, req *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.mu.Lock()
	index := m.calls
	m.calls++
	m.requests = append(m.requests, req)
	m.mu.Unlock()
	return func(yield func(*model.LLMResponse, error) bool) {
		if index < len(m.responses) {
			yield(m.responses[index], nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func (m *sequenceModel) callCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls
}

func (m *sequenceModel) firstRequest() *model.LLMRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.requests) == 0 {
		return nil
	}
	return m.requests[0]
}

func toolCall(id, name string, args map[string]any) *model.LLMResponse {
	return &model.LLMResponse{
		Content:      &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: id, Name: name, Args: args}}}},
		TurnComplete: true,
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

func TestEvaluatorProbeReturnsDirectlyToAnswerInterrupt(t *testing.T) {
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })

	questioner := &sequenceModel{responses: []*model.LLMResponse{
		{Content: genai.NewContentFromText("What is the pulpal diagnosis for tooth #K?", genai.RoleModel), TurnComplete: true},
	}}
	evaluator := &sequenceModel{responses: []*model.LLMResponse{
		toolCall("probe", "ask_probe", map[string]any{"question": "Which radiographic finding argues against pulp necrosis?"}),
		toolCall("score", "append_exchange", map[string]any{
			"question":       "What is the pulpal diagnosis for tooth #K?",
			"answer":         "There is no radiolucency or pathologic resorption.",
			"skillset":       "Diagnosis",
			"skill":          string(SkillUnderstandApply),
			"feedback":       "Correctly integrated the clinical and radiographic findings.",
			"ideal_response": "Symptomatic irreversible pulpitis with no radiographic evidence of necrosis.",
			"score":          3,
			"citations":      []any{},
		}),
		toolCall("complete", "complete_examination", map[string]any{}),
		{Content: genai.NewContentFromText("Feedback recorded.", genai.RoleModel), TurnComplete: true},
	}}
	scorer := &sequenceModel{responses: []*model.LLMResponse{
		toolCall("loading", "set_loading_step", map[string]any{"step": "Computing score card…"}),
		toolCall("card", "set_score_card", map[string]any{
			"markdown":      "## Final feedback\nExcellent diagnostic reasoning.",
			"score_summary": []any{},
			"outcome":       "pass",
		}),
		{Content: genai.NewContentFromText("Score card ready.", genai.RoleModel), TurnComplete: true},
	}}
	models := PhaseModels{
		CaseBuilder: reproModel{"case"},
		Questioner:  questioner,
		Evaluator:   evaluator,
		Scorer:      scorer,
	}
	built, err := New(models, corpus)
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	rn, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		t.Fatal(err)
	}

	readyID := requestID(t, runTurn(t, rn, "Create a case"), "ready")
	answerID := requestID(t, resumeTurn(t, rn, readyID, "ready"), "answer")
	probeEvents := resumeTurn(t, rn, answerID, "Symptomatic irreversible pulpitis.")
	probeID := requestID(t, probeEvents, "probe answer")
	if probeID == answerID {
		t.Fatalf("probe interrupt ID %q reused the original answer interrupt", probeID)
	}
	state := sessionState(t, sessions)
	const probe = "Which radiographic finding argues against pulp necrosis?"
	const originalQuestion = "What is the pulpal diagnosis for tooth #K?"
	if state.ActiveProbe != probe || state.CurrentQuestion != originalQuestion {
		t.Fatalf("probe state = active %q current %q, want active %q current %q", state.ActiveProbe, state.CurrentQuestion, probe, originalQuestion)
	}
	if got := questioner.callCount(); got != 1 {
		t.Fatalf("questioner ran %d times before the probe answer, want 1", got)
	}
	if got := evaluator.callCount(); got != 1 {
		t.Fatalf("evaluator ran %d model turns before the probe answer, want 1", got)
	}

	resumeTurn(t, rn, probeID, "There is no radiolucency or pathologic resorption.")
	state = sessionState(t, sessions)
	if len(state.Transcript) != 1 {
		t.Fatalf("transcript length = %d, want 1", len(state.Transcript))
	}
	if state.ActiveProbe != "" {
		t.Fatalf("active probe = %q, want cleared", state.ActiveProbe)
	}
	if state.Status != PhaseComplete || state.Outcome != "pass" || state.ScoreCard == "" {
		t.Fatalf("final state = status %q outcome %q score card %q", state.Status, state.Outcome, state.ScoreCard)
	}
	if got := scorer.callCount(); got != 3 {
		t.Fatalf("scorer ran %d model turns, want 3", got)
	}
	if got := evaluator.callCount(); got != 4 {
		t.Fatalf("evaluator ran %d total model turns, want 4", got)
	}
	if request := scorer.firstRequest(); request == nil || len(request.Contents) == 0 {
		t.Fatal("scorer received an empty model request")
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
