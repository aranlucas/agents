package oralboards

import (
	"errors"
	"fmt"
	"strings"

	"agents/oralboards/agent/tools"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/agent/workflowagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"
)

type PhaseModels struct {
	CaseBuilder model.LLM
	Questioner  model.LLM
	Evaluator   model.LLM
	Scorer      model.LLM
}

type SearchArgs struct {
	Query      string `json:"query"`
	Collection string `json:"collection,omitempty"`
}
type ReadDocArgs struct {
	Filepath string `json:"filepath"`
}

func New(models PhaseModels, corpus *Corpus, toolsets ...adktool.Toolset) (agent.Agent, error) {
	if models.CaseBuilder == nil || models.Questioner == nil || models.Evaluator == nil || models.Scorer == nil {
		return nil, errors.New("all oralboards phase models are required")
	}
	if corpus == nil || corpus.db == nil {
		return nil, errors.New("oralboards corpus is required")
	}
	caseBuilder, err := buildPhase("case_builder", caseBuilderInstruction, models.CaseBuilder, corpus, []string{"search_docs", "set_case", "set_phase", "set_loading_step"}, nil)
	if err != nil {
		return nil, err
	}
	questioner, err := buildPhase("questioner", questionerInstruction, models.Questioner, corpus, []string{"set_question_target"}, nil)
	if err != nil {
		return nil, err
	}
	evaluator, err := buildPhase("evaluator", evaluatorInstruction, models.Evaluator, corpus, []string{"search_docs", "ask_probe", "append_exchange", "set_loading_step", "complete_examination"}, nil)
	if err != nil {
		return nil, err
	}
	scorer, err := buildPhase("scorer", scorerInstruction, models.Scorer, corpus, []string{"set_score_card", "set_loading_step"}, nil)
	if err != nil {
		return nil, err
	}
	children := map[string]agent.Agent{"case_builder": caseBuilder, "questioner": questioner, "evaluator": evaluator, "scorer": scorer}
	return newWorkflowAgent(children, []agent.Agent{caseBuilder, questioner, evaluator, scorer})
}

// newWorkflowAgent expresses the phase transitions as an ADK graph while
// keeping the phase LLMs in task mode. ADK deliberately rejects task-mode
// LLM agents as static graph nodes, so the graph nodes below invoke them and
// forward their events instead of wrapping them with workflow.NewAgentNode.
func newWorkflowAgent(children map[string]agent.Agent, subAgents []agent.Agent) (agent.Agent, error) {
	caseBuilder := phaseNode("run_case_builder", func(ctx agent.Context, yield func(*session.Event, error) bool) {
		runChild(ctx, children["case_builder"], yield)
	})
	waitReady := requestInputNode("wait_for_ready", func(state State) session.RequestInput {
		return session.RequestInput{
			InterruptID: "oralboards-ready",
			Message:     "Start the oral-board examination when the candidate is ready.",
			Payload:     map[string]any{"kind": "ready", "question": "Ready to begin?"},
		}
	}, func(_ any) map[string]any {
		return map[string]any{"status": "questioning"}
	})
	questioner := phaseNode("run_questioner", func(ctx agent.Context, yield func(*session.Event, error) bool) {
		runQuestioner(ctx, children["questioner"], yield)
	})
	waitAnswer := requestInputNode("wait_for_answer", func(state State) session.RequestInput {
		return session.RequestInput{
			InterruptID: "oralboards-answer-" + fmt.Sprint(len(state.Transcript)),
			Message:     state.CurrentQuestion,
			Payload:     map[string]any{"kind": "answer", "question": state.CurrentQuestion},
		}
	}, func(_ any) map[string]any {
		return map[string]any{"status": "feedback"}
	})
	evaluator := phaseNode("run_evaluator", func(ctx agent.Context, yield func(*session.Event, error) bool) {
		runChild(ctx, children["evaluator"], yield)
	})
	decision := workflow.NewFunctionNode("continue_or_score", func(ctx agent.Context, _ any) (*session.Event, error) {
		state := stateFromSession(ctx.Session().State())
		route := "questioner"
		if state.InterviewComplete {
			route = "scorer"
		}
		event := session.NewEvent(ctx, ctx.InvocationID())
		event.Routes = []string{route}
		return event, nil
	}, workflow.NodeConfig{})
	scorer := phaseNode("run_scorer", func(ctx agent.Context, yield func(*session.Event, error) bool) {
		runChild(ctx, children["scorer"], yield)
	})

	edges := []workflow.Edge{
		{From: workflow.Start, To: caseBuilder},
		{From: caseBuilder, To: waitReady},
		{From: waitReady, To: questioner},
		{From: questioner, To: waitAnswer},
		{From: waitAnswer, To: evaluator},
		{From: evaluator, To: decision},
		{From: decision, To: questioner, Route: workflow.StringRoute("questioner")},
		{From: decision, To: scorer, Route: workflow.StringRoute("scorer")},
	}
	return workflowagent.New(workflowagent.Config{
		Name:        AppName,
		Description: "Pediatric dentistry oral-board practice with deterministic graph phases.",
		SubAgents:   subAgents,
		Edges:       edges,
	})
}

func requestInputNode(name string, request func(State) session.RequestInput, resumed func(any) map[string]any) workflow.Node {
	rerun := true
	return workflow.NewEmittingFunctionNode(name, func(ctx agent.Context, _ any, emit func(*session.Event) error) (any, error) {
		state := stateFromSession(ctx.Session().State())
		req := request(state)
		value, err := workflow.ResumeOrRequestInput(ctx, emit, req)
		if err != nil {
			return nil, err
		}
		if delta := resumed(value); len(delta) > 0 {
			if err := emit(stateDeltaEvent(ctx, delta)); err != nil {
				return nil, err
			}
		}
		return value, nil
	}, workflow.NodeConfig{RerunOnResume: &rerun})
}

func phaseNode(name string, run func(agent.Context, func(*session.Event, error) bool)) workflow.Node {
	return workflow.NewEmittingFunctionNode(name, func(ctx agent.Context, input any, emit func(*session.Event) error) (any, error) {
		userContent := phaseInputContent(input, ctx.UserContent())
		scope := name + "-" + fmt.Sprint(len(stateFromSession(ctx.Session().State()).Transcript))
		childCtx := ctx.WithDelta(&agent.CommonContextDelta{InvocationContextDelta: &agent.InvocationContextDelta{
			UserContent: &userContent, IsolationScope: &scope,
		}})
		var emitErr error
		run(childCtx, func(event *session.Event, err error) bool {
			if err != nil {
				emitErr = err
				return false
			}
			emitErr = emit(event)
			return emitErr == nil
		})
		return nil, emitErr
	}, workflow.NodeConfig{})
}

func phaseInputContent(input any, fallback *genai.Content) *genai.Content {
	if values, ok := input.(map[string]any); ok {
		if answer, ok := values["answer"].(string); ok && strings.TrimSpace(answer) != "" {
			return genai.NewContentFromText(answer, genai.RoleUser)
		}
	}
	if answer, ok := input.(string); ok && strings.TrimSpace(answer) != "" {
		return genai.NewContentFromText(answer, genai.RoleUser)
	}
	return fallback
}

func buildPhase(name, instruction string, m model.LLM, corpus *Corpus, allowed []string, toolsets []adktool.Toolset, afterModel ...llmagent.AfterModelCallback) (agent.Agent, error) {
	all, err := phaseTools(corpus)
	if err != nil {
		return nil, err
	}
	allowedSet := make(map[string]bool, len(allowed))
	for _, value := range allowed {
		allowedSet[value] = true
	}
	selected := make([]adktool.Tool, 0, len(allowed))
	for _, candidate := range all {
		if allowedSet[candidate.Name()] {
			selected = append(selected, candidate)
		}
	}
	return llmagent.New(llmagent.Config{Name: name, Description: name + " phase", Instruction: Instruction + "\n\n" + instruction, Model: m, Mode: llmagent.ModeTask, Tools: selected, Toolsets: toolsets, AfterModelCallbacks: afterModel})
}

func phaseTools(corpus *Corpus) ([]adktool.Tool, error) {
	searchDocsTool, err := tools.NewSearchDocs(func(ctx agent.Context, in SearchArgs) (SearchResponse, error) {
		state := readState(ctx.State())
		response, err := corpus.SearchDocs(ctx, &state, in.Query, in.Collection)
		if err != nil {
			return SearchResponse{}, err
		}
		if err := publishState(ctx, state); err != nil {
			return SearchResponse{}, err
		}
		return response, nil
	})
	if err != nil {
		return nil, err
	}

	readDocTool, err := tools.NewReadDoc(func(ctx agent.Context, in ReadDocArgs) (Document, error) { return corpus.ReadDoc(ctx, in.Filepath) })
	if err != nil {
		return nil, err
	}

	setCaseTool, err := tools.NewSetCase(SetCase)
	if err != nil {
		return nil, err
	}

	setPhaseTool, err := tools.NewSetPhase(SetPhase)
	if err != nil {
		return nil, err
	}

	setLoadingStepTool, err := tools.NewSetLoadingStep(SetLoadingStep)
	if err != nil {
		return nil, err
	}

	setQuestionTargetTool, err := tools.NewSetQuestionTarget(SetQuestionTarget)
	if err != nil {
		return nil, err
	}

	askProbeTool, err := tools.NewAskProbe(AskProbe)
	if err != nil {
		return nil, err
	}

	appendExchangeTool, err := tools.NewAppendExchange(AppendExchange)
	if err != nil {
		return nil, err
	}

	setScoreCardTool, err := tools.NewSetScoreCard(SetScoreCard)
	if err != nil {
		return nil, err
	}

	completeExaminationTool, err := tools.NewCompleteExamination(CompleteExamination)
	if err != nil {
		return nil, err
	}

	return []adktool.Tool{
		searchDocsTool,
		readDocTool,
		setCaseTool,
		setPhaseTool,
		setLoadingStepTool,
		setQuestionTargetTool,
		askProbeTool,
		appendExchangeTool,
		setScoreCardTool,
		completeExaminationTool,
	}, nil
}

func runChild(ctx agent.InvocationContext, child agent.Agent, yield func(*session.Event, error) bool) bool {
	_, ok := runChildCapturingQuestion(ctx, child, yield)
	return ok
}

// childCapture holds what a child's run surfaced: the question argument of
// its last ask_question client-tool call (authoritative when present) and
// the plain text of its last complete response (fallback — task models often
// follow a tool call with completion narration that must not win).
type childCapture struct {
	askedQuestion string
	finalText     string
}

func runChildCapturingQuestion(ctx agent.InvocationContext, child agent.Agent, yield func(*session.Event, error) bool) (childCapture, bool) {
	capture := childCapture{}
	for event, err := range child.Run(ctx) {
		if err == nil && event != nil && !event.Partial {
			if t := eventText(event); t != "" {
				capture.finalText = t
			}
			if q := askQuestionArg(event); q != "" {
				capture.askedQuestion = q
			}
		}
		if !yield(event, err) || err != nil || ctx.Ended() {
			return capture, false
		}
	}
	return capture, true
}

func askQuestionArg(event *session.Event) string {
	if event.Content == nil {
		return ""
	}
	for _, part := range event.Content.Parts {
		if part == nil || part.FunctionCall == nil || part.FunctionCall.Name != "ask_question" {
			continue
		}
		if question, ok := part.FunctionCall.Args["question"].(string); ok {
			return strings.TrimSpace(question)
		}
	}
	return ""
}

func eventText(event *session.Event) string {
	if event.Content == nil {
		return ""
	}
	var b strings.Builder
	for _, part := range event.Content.Parts {
		if part != nil && !part.Thought && part.Text != "" {
			b.WriteString(part.Text)
		}
	}
	return strings.TrimSpace(b.String())
}

// runQuestioner runs the questioner child, persists the question it asked
// (the ask_question client tool used to write current_question via client
// state, which the gateway no longer accepts), and reruns it once with craft
// feedback when the question violates question-craft rules.
func runQuestioner(ctx agent.InvocationContext, questioner agent.Agent, yield func(*session.Event, error) bool) {
	capture, ok := runChildCapturingQuestion(ctx, questioner, yield)
	if !ok {
		return
	}
	if !persistQuestion(ctx, capture, yield) {
		return
	}
	state := stateFromSession(ctx.Session().State())
	violations := QuestionCraftViolations(state.CurrentQuestion)
	if len(violations) == 0 {
		return
	}
	feedback := strings.Join(violations, "; ")
	if !yield(stateDeltaEvent(ctx, map[string]any{"question_craft_feedback": feedback}), nil) {
		return
	}
	capture, ok = runChildCapturingQuestion(ctx, questioner, yield)
	if !ok {
		return
	}
	if persistQuestion(ctx, capture, yield) {
		yield(stateDeltaEvent(ctx, map[string]any{"question_craft_feedback": ""}), nil)
	}
}

// persistQuestion writes the surfaced question into current_question. The
// ask_question argument always wins; final text is a fallback used only when
// no question has been recorded yet, so completion narration ("The questioner
// phase is complete. Summary…") never replaces a real question.
func persistQuestion(ctx agent.InvocationContext, capture childCapture, yield func(*session.Event, error) bool) bool {
	question := capture.askedQuestion
	if question == "" {
		if stateFromSession(ctx.Session().State()).CurrentQuestion != "" {
			return true
		}
		question = capture.finalText
	}
	if question == "" {
		return true
	}
	return yield(stateDeltaEvent(ctx, map[string]any{"current_question": question}), nil)
}

func stateDeltaEvent(ctx agent.InvocationContext, delta map[string]any) *session.Event {
	return &session.Event{InvocationID: ctx.InvocationID(), Author: AppName, Actions: session.EventActions{StateDelta: delta}}
}

func stateFromSession(state session.ReadonlyState) State {
	return readState(state)
}

const (
	caseBuilderInstruction = `Build one grounded candidate-facing vignette. Call set_loading_step, search_docs, then set_case and set_phase("presenting"). Do not ask a clinical question.`
	questionerInstruction  = `Read case and transcript state. Call set_question_target exactly once, then return one open-ended clinical question only. Do not call a frontend tool. Rewrite using question_craft_feedback when present.`
	evaluatorInstruction   = `Evaluate the latest candidate answer against case_passages. Use at most one probe and do not score until its answer arrives. Otherwise call append_exchange; call complete_examination after the final relevant skillset.`
	scorerInstruction      = `Call set_loading_step then set_score_card with cited narrative feedback, structured per-skillset ABPD 1-3 scores, and pass, borderline, or not_yet outcome.`
)
