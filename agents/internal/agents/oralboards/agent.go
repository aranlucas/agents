package oralboards

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
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

func New(models PhaseModels, corpus *Corpus, toolsets ...tool.Toolset) (agent.Agent, error) {
	if models.CaseBuilder == nil || models.Questioner == nil || models.Evaluator == nil || models.Scorer == nil {
		return nil, errors.New("all oralboards phase models are required")
	}
	if corpus == nil || corpus.db == nil {
		return nil, errors.New("oralboards corpus is required")
	}
	caseBuilder, err := buildPhase("case_builder", caseBuilderInstruction, models.CaseBuilder, corpus, []string{"search_docs", "set_case", "set_phase", "set_loading_step"}, toolsets)
	if err != nil {
		return nil, err
	}
	questioner, err := buildPhase("questioner", questionerInstruction, models.Questioner, corpus, []string{"set_question_target"}, toolsets)
	if err != nil {
		return nil, err
	}
	evaluator, err := buildPhase("evaluator", evaluatorInstruction, models.Evaluator, corpus, []string{"search_docs", "ask_probe", "append_exchange", "set_loading_step", "complete_examination"}, toolsets)
	if err != nil {
		return nil, err
	}
	scorer, err := buildPhase("scorer", scorerInstruction, models.Scorer, corpus, []string{"set_score_card", "set_loading_step"}, toolsets)
	if err != nil {
		return nil, err
	}
	children := map[string]agent.Agent{"case_builder": caseBuilder, "questioner": questioner, "evaluator": evaluator, "scorer": scorer}
	return agent.New(agent.Config{
		Name: AppName, Description: "Pediatric dentistry oral-board practice with deterministic phases.",
		SubAgents: []agent.Agent{caseBuilder, questioner, evaluator, scorer},
		Run: func(ctx agent.InvocationContext) iter.Seq2[*session.Event, error] {
			return runOrchestrator(ctx, children)
		},
	})
}

func buildPhase(name, instruction string, m model.LLM, corpus *Corpus, allowed []string, toolsets []tool.Toolset) (agent.Agent, error) {
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
	return llmagent.New(llmagent.Config{Name: name, Description: name + " phase", Instruction: Instruction + "\n\n" + instruction, Model: m, Mode: llmagent.ModeTask, Tools: selected, Toolsets: toolsets})
}

func phaseTools(corpus *Corpus) ([]tool.Tool, error) {
	var result []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "search_docs", Description: "Search the bundled pediatric dentistry corpus; maximum two calls per episode."}, func(ctx agent.Context, in SearchArgs) (SearchResponse, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		response, err := corpus.SearchDocs(ctx, tx, in.Query, in.Collection)
		if err != nil {
			return SearchResponse{}, err
		}
		if err := agentruntime.Commit(ctx, tx); err != nil {
			return SearchResponse{}, err
		}
		return response, nil
	})); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "read_doc", Description: "Read one corpus document by an exact path returned by search_docs."}, func(ctx agent.Context, in ReadDocArgs) (Document, error) { return corpus.ReadDoc(ctx, in.Filepath) })); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_case", Description: "Write the grounded candidate vignette and source passages."}, wrap(SetCase))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_phase", Description: "Transition the oral exam phase."}, wrap(SetPhase))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_loading_step", Description: "Set a concise progress message for the exam UI."}, wrap(SetLoadingStep))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_question_target", Description: "Declare the exact ABPD domain and cognitive skill assessed next."}, wrap(SetQuestionTarget))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "ask_probe", Description: "Ask one probing follow-up before scoring a partial answer."}, wrap(AskProbe))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "append_exchange", Description: "Append one scored exchange after the candidate has answered."}, wrap(AppendExchange))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_score_card", Description: "Write final ABPD 1-3 per-skillset scores and outcome."}, wrap(SetScoreCard))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "complete_examination", Description: "Mark questioning complete so the deterministic router runs the scorer."}, wrap(CompleteExamination))); err != nil {
		return nil, err
	}
	return result, nil
}

type stateHandler[A any] func(context.Context, *agentruntime.Transaction, A) (Result, error)

func wrap[A any](handler stateHandler[A]) functiontool.Func[A, Result] {
	return func(ctx agent.Context, input A) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		output, err := handler(ctx, tx, input)
		if err != nil {
			return Result{}, err
		}
		if output.OK {
			if probeFlag, exists := tx.Get(session.KeyPrefixTemp + "probe_asked_now"); exists {
				if err := ctx.State().Set(session.KeyPrefixTemp+"probe_asked_now", probeFlag); err != nil {
					return Result{}, fmt.Errorf("set oralboards invocation guard: %w", err)
				}
			}
			if err := agentruntime.Commit(ctx, tx); err != nil {
				return Result{}, fmt.Errorf("commit oralboards state: %w", err)
			}
		}
		return output, nil
	}
}

func runOrchestrator(ctx agent.InvocationContext, children map[string]agent.Agent) iter.Seq2[*session.Event, error] {
	return func(yield func(*session.Event, error) bool) {
		state := stateFromSession(ctx.Session().State())
		// The AG-UI gateway never applies RunAgentInput.state (server state
		// is authoritative — see internal/agui/state.go's
		// requestStateOverlay), so the exam transitions the web client
		// performs via agent.setState must be derived here from the turn's
		// user message: "ready" starts questioning, and any other candidate
		// text during questioning is an answer for the evaluator.
		if transition := messageTransition(state, userText(ctx)); transition != "" {
			if !yield(stateDeltaEvent(ctx, map[string]any{"status": transition}), nil) {
				return
			}
			state.Status = transition
		}
		phase := RoutePhase(state)
		if phase == "questioner" {
			runQuestioner(ctx, children[phase], yield)
			return
		}
		if !runChild(ctx, children[phase], yield) {
			return
		}
		if phase != "evaluator" {
			return
		}
		state = stateFromSession(ctx.Session().State())
		if state.InterviewComplete {
			runChild(ctx, children["scorer"], yield)
		} else if state.Status == "questioning" {
			runQuestioner(ctx, children["questioner"], yield)
		}
	}
}

// messageTransition returns the status the session must move to before
// routing, or "" when the turn does not change phase.
func messageTransition(state State, text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	ready := strings.EqualFold(text, "ready")
	if state.Status == "presenting" && ready {
		return "questioning"
	}
	if state.Status == "questioning" && !ready {
		return "feedback"
	}
	return ""
}

func userText(ctx agent.InvocationContext) string {
	content := ctx.UserContent()
	if content == nil {
		return ""
	}
	var b strings.Builder
	for _, part := range content.Parts {
		if part != nil && !part.Thought && part.Text != "" {
			b.WriteString(part.Text)
		}
	}
	return b.String()
}

func runChild(ctx agent.InvocationContext, child agent.Agent, yield func(*session.Event, error) bool) bool {
	_, ok := runChildCapturingText(ctx, child, yield)
	return ok
}

// runChildCapturingText forwards a child's events and returns the plain text
// of its last complete response.
func runChildCapturingText(ctx agent.InvocationContext, child agent.Agent, yield func(*session.Event, error) bool) (string, bool) {
	text := ""
	for event, err := range child.Run(ctx) {
		if err == nil && event != nil && !event.Partial {
			if t := eventText(event); t != "" {
				text = t
			}
		}
		if !yield(event, err) || err != nil || ctx.Ended() {
			return text, false
		}
	}
	return text, true
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

// runQuestioner runs the questioner child, persists the question it returned
// as text (the ask_question client tool used to write current_question via
// client state, which the gateway no longer accepts), and reruns it once with
// craft feedback when the question violates question-craft rules.
func runQuestioner(ctx agent.InvocationContext, questioner agent.Agent, yield func(*session.Event, error) bool) {
	question, ok := runChildCapturingText(ctx, questioner, yield)
	if !ok {
		return
	}
	if !persistQuestion(ctx, question, yield) {
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
	question, ok = runChildCapturingText(ctx, questioner, yield)
	if !ok {
		return
	}
	if persistQuestion(ctx, question, yield) {
		yield(stateDeltaEvent(ctx, map[string]any{"question_craft_feedback": ""}), nil)
	}
}

func persistQuestion(ctx agent.InvocationContext, question string, yield func(*session.Event, error) bool) bool {
	if question == "" {
		return true
	}
	return yield(stateDeltaEvent(ctx, map[string]any{"current_question": question}), nil)
}

func stateDeltaEvent(ctx agent.InvocationContext, delta map[string]any) *session.Event {
	return &session.Event{InvocationID: ctx.InvocationID(), Author: AppName, Actions: session.EventActions{StateDelta: delta}}
}
func stateFromSession(state session.ReadonlyState) State {
	return decodeState(agentruntime.NewTransactionFromState(state))
}

const caseBuilderInstruction = `Build one grounded candidate-facing vignette. Call set_loading_step, search_docs, then set_case and set_phase("presenting"). Do not ask a clinical question.`
const questionerInstruction = `Read case and transcript state. Call set_question_target exactly once, then return one open-ended clinical question only. Rewrite using question_craft_feedback when present.`
const evaluatorInstruction = `Evaluate the latest candidate answer against case_passages. Use at most one probe and do not score until its answer arrives. Otherwise call append_exchange; call complete_examination after the final relevant skillset.`
const scorerInstruction = `Call set_loading_step then set_score_card with cited narrative feedback, structured per-skillset ABPD 1-3 scores, and pass, borderline, or not_yet outcome.`
