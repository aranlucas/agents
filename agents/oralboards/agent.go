package oralboards

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/agent/workflowagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
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

type requestInputKind string

const (
	requestInputReady  requestInputKind = "ready"
	requestInputAnswer requestInputKind = "answer"
)

type requestInputPayload struct {
	Kind     requestInputKind `json:"kind"`
	Question string           `json:"question"`
}

type requestInputResponse struct {
	Answer string `json:"answer"`
}

func New(models PhaseModels, corpus *Corpus, toolsets ...tool.Toolset) (agent.Agent, error) {
	if models.CaseBuilder == nil || models.Questioner == nil || models.Evaluator == nil || models.Scorer == nil {
		return nil, errors.New("all oralboards phase models are required")
	}
	if corpus == nil || corpus.db == nil {
		return nil, errors.New("oralboards corpus is required")
	}
	caseBuilder, err := buildPhase("case_builder", caseBuilderInstruction, models.CaseBuilder, corpus, []string{"search_docs", "set_case", "set_loading_step"}, nil, nil)
	if err != nil {
		return nil, err
	}
	questioner, err := buildPhase("questioner", questionerInstruction, models.Questioner, corpus, nil, nil, nil)
	if err != nil {
		return nil, err
	}
	evaluator, err := buildPhase("evaluator", evaluatorInstruction, nonStreamingModel{models.Evaluator}, corpus, []string{"search_docs", "ask_probe", "append_exchange", "set_loading_step", "complete_examination"}, nil, []llmagent.BeforeModelCallback{stopEvaluatorAfterProbe})
	if err != nil {
		return nil, err
	}
	scorer, err := buildPhase("scorer", scorerInstruction, models.Scorer, corpus, []string{"set_score_card", "set_loading_step"}, nil, nil)
	if err != nil {
		return nil, err
	}
	return newWorkflowAgent(caseBuilder, questioner, evaluator, scorer)
}

// newWorkflowAgent expresses the entire exam as native ADK graph nodes. Each
// LLM phase is single-turn: it may chain tools, but completes on its final
// model response instead of requiring the task-mode finish_task handshake.
func newWorkflowAgent(caseBuilderAgent, questionerAgent, evaluatorAgent, scorerAgent agent.Agent) (agent.Agent, error) {
	caseBuilder, err := workflow.NewAgentNodeTyped[string, string](caseBuilderAgent, workflow.NodeConfig{})
	if err != nil {
		return nil, err
	}
	questioner, err := workflow.NewAgentNodeTyped[string, string](questionerAgent, workflow.NodeConfig{})
	if err != nil {
		return nil, err
	}
	evaluator, err := workflow.NewAgentNodeTyped[string, string](evaluatorAgent, workflow.NodeConfig{})
	if err != nil {
		return nil, err
	}
	scorer, err := workflow.NewAgentNodeTyped[string, string](scorerAgent, workflow.NodeConfig{})
	if err != nil {
		return nil, err
	}
	responseSchema, err := jsonschema.For[requestInputResponse](nil)
	if err != nil {
		return nil, fmt.Errorf("build oralboards input response schema: %w", err)
	}
	waitReady := requestInputNode("wait_for_ready", PhaseQuestioning, "", func(state State) session.RequestInput {
		return session.RequestInput{
			InterruptID:    "oralboards-ready",
			Message:        "Start the oral-board examination when the candidate is ready.",
			ResponseSchema: responseSchema,
			Payload: requestInputPayload{
				Kind:     requestInputReady,
				Question: "Ready to begin?",
			},
		}
	})
	persistQuestion := workflow.NewEmittingFunctionNode("persist_question", func(ctx agent.Context, question string, emit func(*session.Event) error) (any, error) {
		question = strings.TrimSpace(question)
		violations := QuestionCraftViolations(question)
		feedback := strings.Join(violations, "; ")
		if err := emit(questionStateDeltaEvent(ctx, question, feedback)); err != nil {
			return nil, err
		}
		event := session.NewEvent(ctx, ctx.InvocationID())
		event.Output = question
		event.Routes = []string{"valid"}
		if err := emit(event); err != nil {
			return nil, err
		}
		return nil, nil
	}, workflow.NodeConfig{})
	waitAnswer := requestInputNode("wait_for_answer", PhaseFeedback, "Reviewing your answer…", func(state State) session.RequestInput {
		interruptID := "oralboards-answer-" + fmt.Sprint(len(state.Transcript))
		question := state.CurrentQuestion
		if state.ActiveProbe != "" {
			interruptID = "oralboards-probe-" + fmt.Sprint(len(state.Transcript))
			question = state.ActiveProbe
		}
		return session.RequestInput{
			InterruptID:    interruptID,
			Message:        question,
			ResponseSchema: responseSchema,
			Payload: requestInputPayload{
				Kind:     requestInputAnswer,
				Question: question,
			},
		}
	})
	decision := workflow.NewFunctionNode("continue_or_score", func(ctx agent.Context, _ string) (*session.Event, error) {
		state := stateFromSession(ctx.Session().State())
		route := "questioner"
		if state.ActiveProbe != "" {
			route = "probe"
		} else if state.InterviewComplete {
			route = "scorer"
		}
		event := session.NewEvent(ctx, ctx.InvocationID())
		event.Routes = []string{route}
		switch route {
		case "questioner":
			event.Output = "Ask the next distinct oral-board question."
		case "scorer":
			event.Output = "Generate the final score card from the completed exchanges."
		}
		return event, nil
	}, workflow.NodeConfig{})
	edges := []workflow.Edge{
		{From: workflow.Start, To: caseBuilder},
		{From: caseBuilder, To: waitReady},
		{From: waitReady, To: questioner},
		{From: questioner, To: persistQuestion},
		{From: persistQuestion, To: waitAnswer, Route: workflow.StringRoute("valid")},
		{From: waitAnswer, To: evaluator},
		{From: evaluator, To: decision},
		{From: decision, To: waitAnswer, Route: workflow.StringRoute("probe")},
		{From: decision, To: questioner, Route: workflow.StringRoute("questioner")},
		{From: decision, To: scorer, Route: workflow.StringRoute("scorer")},
	}
	return workflowagent.New(workflowagent.Config{
		Name:        AppName,
		Description: "Pediatric dentistry oral-board practice with deterministic graph phases.",
		SubAgents:   []agent.Agent{caseBuilderAgent, questionerAgent, evaluatorAgent, scorerAgent},
		Edges:       edges,
	})
}

func requestInputNode(name string, resumedPhase Phase, loadingStep string, request func(State) session.RequestInput) workflow.Node {
	rerun := true
	return workflow.NewEmittingFunctionNode(name, func(ctx agent.Context, _ string, emit func(*session.Event) error) (string, error) {
		state := stateFromSession(ctx.Session().State())
		req := request(state)
		interruptPrefix := strings.TrimSpace(req.InterruptID)
		if interruptPrefix == "" {
			interruptPrefix = name
		}
		req.InterruptID = interruptPrefix + "-" + ctx.InvocationID()
		value, err := workflow.ResumeOrRequestInput(ctx, emit, req)
		if err != nil {
			return "", err
		}
		answer, err := decodeRequestInputResponse(value)
		if err != nil {
			return "", err
		}
		if err := emit(resumedPhaseStateDeltaEvent(ctx, resumedPhase, loadingStep)); err != nil {
			return "", err
		}
		return answer, nil
	}, workflow.NodeConfig{RerunOnResume: &rerun})
}

func decodeRequestInputResponse(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", errors.New("encode oralboards input response")
	}
	var response requestInputResponse
	if json.Unmarshal(encoded, &response) != nil || strings.TrimSpace(response.Answer) == "" {
		return "", errors.New("oralboards input response requires a non-empty answer")
	}
	return strings.TrimSpace(response.Answer), nil
}

func buildPhase(name, instruction string, m model.LLM, corpus *Corpus, allowed []string, toolsets []tool.Toolset, beforeModel []llmagent.BeforeModelCallback, afterModel ...llmagent.AfterModelCallback) (agent.Agent, error) {
	all, err := phaseTools(corpus)
	if err != nil {
		return nil, err
	}
	allowedSet := make(map[string]bool, len(allowed))
	for _, value := range allowed {
		allowedSet[value] = true
	}
	selected := make([]tool.Tool, 0, len(allowed))
	for _, candidate := range all {
		if allowedSet[candidate.Name()] {
			selected = append(selected, candidate)
		}
	}
	return llmagent.New(llmagent.Config{Name: name, Description: name + " phase", Instruction: Instruction + "\n\n" + instruction, Model: m, Mode: llmagent.ModeSingleTurn, Tools: selected, Toolsets: toolsets, BeforeModelCallbacks: beforeModel, AfterModelCallbacks: afterModel})
}

// stopEvaluatorAfterProbe turns ask_probe into a deterministic phase boundary.
// Without it, the LLM receives the successful tool result and may continue in
// the same turn, attempt append_exchange, and prevent the workflow from
// reaching the RequestInput node that collects the probe answer.
func stopEvaluatorAfterProbe(ctx agent.Context, _ *model.LLMRequest) (*model.LLMResponse, error) {
	probeAskedNow, _ := ctx.State().Get(session.KeyPrefixTemp + "probe_asked_now")
	if probeAskedNow != true {
		return nil, nil
	}
	return &model.LLMResponse{
		Content:      genai.NewContentFromText("Probe requested.", genai.RoleModel),
		TurnComplete: true,
	}, nil
}

func phaseTools(corpus *Corpus) ([]tool.Tool, error) {
	searchDocsTool, err := functiontool.New(functiontool.Config{
		Name:        "search_docs",
		Description: "Search the bundled pediatric dentistry corpus; maximum two calls per episode.",
	}, func(ctx agent.Context, in SearchArgs) (SearchResponse, error) {
		state := readState(ctx.State())
		response, err := corpus.SearchDocs(ctx, &state, in.Query, in.Collection)
		if err != nil {
			return SearchResponse{}, err
		}
		if err := ctx.State().Set("_search_docs_calls", state.SearchCalls); err != nil {
			return SearchResponse{}, fmt.Errorf("set _search_docs_calls: %w", err)
		}
		return response, nil
	})
	if err != nil {
		return nil, err
	}

	readDocTool, err := functiontool.New(functiontool.Config{
		Name:        "read_doc",
		Description: "Read one corpus document by an exact path returned by search_docs.",
	}, func(ctx agent.Context, in ReadDocArgs) (Document, error) { return corpus.ReadDoc(ctx, in.Filepath) })
	if err != nil {
		return nil, err
	}

	setCaseTool, err := functiontool.New(functiontool.Config{
		Name:        "set_case",
		Description: "Write only the grounded neutral candidate vignette and source passages. The case must not contain an examination question, reveal the management answer, or include image placeholders.",
	}, SetCase)
	if err != nil {
		return nil, err
	}

	setPhaseTool, err := functiontool.New(functiontool.Config{
		Name:        "set_phase",
		Description: "Transition the oral exam phase.",
	}, SetPhase)
	if err != nil {
		return nil, err
	}

	setLoadingStepTool, err := functiontool.New(functiontool.Config{
		Name:        "set_loading_step",
		Description: "Set a concise progress message for the exam UI.",
	}, SetLoadingStep)
	if err != nil {
		return nil, err
	}

	askProbeTool, err := functiontool.New(functiontool.Config{
		Name:        "ask_probe",
		Description: "Ask one probing follow-up before scoring a partial answer.",
	}, AskProbe)
	if err != nil {
		return nil, err
	}

	appendExchangeTool, err := functiontool.New(functiontool.Config{
		Name:        "append_exchange",
		Description: "Append one scored exchange after the candidate has answered. skillset is a concise clinical domain label; skill must be exactly remember, understand_apply, or analyze_evaluate.",
	}, AppendExchange)
	if err != nil {
		return nil, err
	}

	setScoreCardTool, err := functiontool.New(functiontool.Config{
		Name:        "set_score_card",
		Description: "Write final ABPD 1-3 per-skillset scores and outcome. Every score_summary skill must be exactly remember, understand_apply, or analyze_evaluate.",
	}, SetScoreCard)
	if err != nil {
		return nil, err
	}

	completeExaminationTool, err := functiontool.New(functiontool.Config{
		Name:        "complete_examination",
		Description: "Mark questioning complete after at least six scored exchanges so the deterministic router runs the scorer. The tool rejects shorter interviews.",
	}, CompleteExamination)
	if err != nil {
		return nil, err
	}

	return []tool.Tool{
		searchDocsTool,
		readDocTool,
		setCaseTool,
		setPhaseTool,
		setLoadingStepTool,
		askProbeTool,
		appendExchangeTool,
		setScoreCardTool,
		completeExaminationTool,
	}, nil
}

func resumedPhaseStateDeltaEvent(ctx agent.InvocationContext, status Phase, loadingStep string) *session.Event {
	event := session.NewEvent(ctx, ctx.InvocationID())
	event.Author = AppName
	event.Actions.StateDelta = map[string]any{
		"status":       status,
		"loading_step": loadingStep,
	}
	return event
}

func questionStateDeltaEvent(ctx agent.InvocationContext, question, feedback string) *session.Event {
	event := session.NewEvent(ctx, ctx.InvocationID())
	event.Author = AppName
	event.Actions.StateDelta = map[string]any{
		"current_question":        question,
		"question_craft_feedback": feedback,
		"_probe_used":             false,
	}
	return event
}

func stateFromSession(state session.ReadonlyState) State {
	return readState(state)
}

const (
	caseBuilderInstruction = `Build one grounded candidate-facing vignette. Call set_loading_step, search_docs, then set_case; set_case performs the presenting transition atomically. Do not ask a clinical question. After the tools finish, reply exactly: Case ready.`
	questionerInstruction  = `Case vignette: {case?}
Prior exchanges: {transcript?}
Question-craft feedback: {question_craft_feedback?}
Run a substantive mock interview of at least six scored exchanges. Progress through distinct clinical decisions relevant to this case, such as assessment, diagnosis, management, alternatives, complications, follow-up, or communication; use the prior exchanges to avoid repeating a question.
Your entire response is persisted verbatim as the next question. Return exactly one open-ended clinical question and nothing else. Do not discuss these instructions, explain your reasoning, show drafts, add a preface, or call a tool. Rewrite the question using question-craft feedback when present.`
	evaluatorInstruction = `Case evidence: {case_passages?}
Current question: {current_question?}
Active probe: {active_probe?}
Prior exchanges: {transcript?}
Evaluate the candidate answer supplied as this node's input. Use at most one probe and do not score until its answer arrives. Otherwise call append_exchange, using a concise clinical domain for skillset and exactly one of remember, understand_apply, or analyze_evaluate for skill. A full practice interview requires at least six scored exchanges. Call complete_examination only after append_exchange has recorded at least the sixth exchange and all relevant dimensions of the case have been assessed; otherwise end your turn so the workflow asks the next question.`
	scorerInstruction = `Completed exchanges: {transcript?}
Call set_loading_step then set_score_card with cited narrative feedback, structured per-skillset ABPD 1-3 scores, and pass, borderline, or not_yet outcome. For every score_summary item, use a concise clinical domain for skillset and exactly one of remember, understand_apply, or analyze_evaluate for skill.`
)
