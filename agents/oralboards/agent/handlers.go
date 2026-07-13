package oralboards

import (
	"errors"
	"fmt"
	"strings"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

var (
	ErrProbeAlreadyUsed  = errors.New("probe already used for this question")
	ErrProbeNotAnswered  = errors.New("cannot score in the same turn as a probe")
	ErrInterviewTooShort = errors.New("oralboards interview is not complete")
	ErrInvalidPhase      = errors.New("invalid oralboards phase")
	ErrInvalidScore      = errors.New("oralboards score must be 1, 2, or 3")
)

// MinimumInterviewExchanges keeps a practice vignette from collapsing into a
// one-question quiz. ABPD does not publish a fixed question count per
// vignette, so this is an application-level floor for a substantive mock
// interview; the examiner may continue beyond it when the case warrants.
const MinimumInterviewExchanges = 6

type Result struct {
	OK      bool   `json:"ok"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Count   int    `json:"count,omitempty"`
	Length  int    `json:"length,omitempty"`
}

type SetCaseArgs struct {
	Case         string       `json:"case"`
	CaseSources  []CaseSource `json:"case_sources"`
	CasePassages []string     `json:"case_passages"`
}
type SetPhaseArgs struct {
	Phase Phase `json:"phase"`
}
type LoadingArgs struct {
	Step string `json:"step"`
}
type ProbeArgs struct {
	Question string `json:"question"`
}
type AppendExchangeArgs struct {
	Question      string       `json:"question"`
	Answer        string       `json:"answer"`
	Skillset      string       `json:"skillset"`
	Skill         Skill        `json:"skill"`
	Feedback      string       `json:"feedback"`
	IdealResponse string       `json:"ideal_response"`
	Score         int          `json:"score"`
	Citations     []CaseSource `json:"citations"`
}
type ScoreCardArgs struct {
	Markdown     string          `json:"markdown"`
	ScoreSummary []SkillsetScore `json:"score_summary"`
	Outcome      string          `json:"outcome"`
}

func SetCase(ctx agent.Context, in SetCaseArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setCase(&state, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("case", state.Case); err != nil {
		return Result{}, fmt.Errorf("set case: %w", err)
	}
	if err := ctx.State().Set("case_sources", state.CaseSources); err != nil {
		return Result{}, fmt.Errorf("set case_sources: %w", err)
	}
	if err := ctx.State().Set("case_passages", state.CasePassages); err != nil {
		return Result{}, fmt.Errorf("set case_passages: %w", err)
	}
	if err := ctx.State().Set("interview_complete", state.InterviewComplete); err != nil {
		return Result{}, fmt.Errorf("set interview_complete: %w", err)
	}
	if err := ctx.State().Set("_probe_used", state.ProbeUsed); err != nil {
		return Result{}, fmt.Errorf("set _probe_used: %w", err)
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, fmt.Errorf("set status: %w", err)
	}
	if err := ctx.State().Set("_search_docs_calls", state.SearchCalls); err != nil {
		return Result{}, fmt.Errorf("set _search_docs_calls: %w", err)
	}
	return result, nil
}

func setCase(state *State, in SetCaseArgs) (Result, error) {
	if strings.TrimSpace(in.Case) == "" {
		return Result{}, errors.New("case is required")
	}
	if strings.Contains(in.Case, "?") {
		return Result{}, errors.New("case vignette must be neutral and must not contain an examination question")
	}
	if strings.Contains(strings.ToLower(in.Case), "[insert image") {
		return Result{}, errors.New("case vignette must not contain unrealized image placeholders")
	}
	if in.CaseSources == nil {
		in.CaseSources = []CaseSource{}
	}
	if in.CasePassages == nil {
		in.CasePassages = []string{}
	}
	state.Case = in.Case
	state.CaseSources = in.CaseSources
	state.CasePassages = strings.Join(in.CasePassages, "\n\n---\n\n")
	state.InterviewComplete = false
	state.ProbeUsed = false
	state.Status = PhasePresenting
	state.SearchCalls = 0
	return Result{OK: true, Status: "success", Length: len(in.Case)}, nil
}

func SetPhase(ctx agent.Context, in SetPhaseArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setPhase(&state, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, fmt.Errorf("set status: %w", err)
	}
	return result, nil
}

func setPhase(state *State, in SetPhaseArgs) (Result, error) {
	switch in.Phase {
	case PhasePresenting, PhaseQuestioning, PhaseComplete:
	default:
		return Result{}, ErrInvalidPhase
	}
	state.Status = in.Phase
	return Result{OK: true, Status: "success"}, nil
}

func SetLoadingStep(ctx agent.Context, in LoadingArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setLoadingStep(&state, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("loading_step", state.LoadingStep); err != nil {
		return Result{}, fmt.Errorf("set loading_step: %w", err)
	}
	return result, nil
}

func setLoadingStep(state *State, in LoadingArgs) (Result, error) {
	state.LoadingStep = strings.TrimSpace(in.Step)
	return Result{OK: true, Status: "success"}, nil
}

// AskProbe is the ADK-facing tool handler for ask_probe. It sets the
// temp:probe_asked_now invocation guard directly on ctx.State() (not part of
// the typed State struct) so append_exchange can refuse to score in the same
// turn as an unanswered probe.
func AskProbe(ctx agent.Context, in ProbeArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := askProbe(&state, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("active_probe", state.ActiveProbe); err != nil {
		return Result{}, fmt.Errorf("set active_probe: %w", err)
	}
	if err := ctx.State().Set("_probe_used", state.ProbeUsed); err != nil {
		return Result{}, fmt.Errorf("set _probe_used: %w", err)
	}
	if err := ctx.State().Set("_search_docs_calls", state.SearchCalls); err != nil {
		return Result{}, fmt.Errorf("set _search_docs_calls: %w", err)
	}
	if err := ctx.State().Set("loading_step", state.LoadingStep); err != nil {
		return Result{}, fmt.Errorf("set loading_step: %w", err)
	}
	if err := ctx.State().Set(session.KeyPrefixTemp+"probe_asked_now", true); err != nil {
		return Result{}, fmt.Errorf("set oralboards invocation guard: %w", err)
	}
	return result, nil
}

func askProbe(state *State, in ProbeArgs) (Result, error) {
	if state.ActiveProbe != "" || state.ProbeUsed {
		return Result{}, ErrProbeAlreadyUsed
	}
	question := strings.TrimSpace(in.Question)
	if question == "" {
		return Result{}, errors.New("probe question is required")
	}
	state.ActiveProbe = question
	state.ProbeUsed = true
	state.SearchCalls = 0
	state.LoadingStep = ""
	return Result{OK: true, Status: "success", Message: "Probe question displayed."}, nil
}

// AppendExchange is the ADK-facing tool handler for append_exchange. It
// reads the temp:probe_asked_now invocation guard directly from ctx.State()
// (set by AskProbe above) before running the pure state-mutation logic.
func AppendExchange(ctx agent.Context, in AppendExchangeArgs) (Result, error) {
	probeAskedNow, _ := ctx.State().Get(session.KeyPrefixTemp + "probe_asked_now")
	state := readState(ctx.State())
	result, err := appendExchange(&state, probeAskedNow == true, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("transcript", state.Transcript); err != nil {
		return Result{}, fmt.Errorf("set transcript: %w", err)
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, fmt.Errorf("set status: %w", err)
	}
	if err := ctx.State().Set("loading_step", state.LoadingStep); err != nil {
		return Result{}, fmt.Errorf("set loading_step: %w", err)
	}
	if err := ctx.State().Set("current_question", state.CurrentQuestion); err != nil {
		return Result{}, fmt.Errorf("set current_question: %w", err)
	}
	if err := ctx.State().Set("active_feedback", state.ActiveFeedback); err != nil {
		return Result{}, fmt.Errorf("set active_feedback: %w", err)
	}
	if err := ctx.State().Set("active_ideal_response", state.ActiveIdealResponse); err != nil {
		return Result{}, fmt.Errorf("set active_ideal_response: %w", err)
	}
	if err := ctx.State().Set("active_probe", state.ActiveProbe); err != nil {
		return Result{}, fmt.Errorf("set active_probe: %w", err)
	}
	if err := ctx.State().Set("_search_docs_calls", state.SearchCalls); err != nil {
		return Result{}, fmt.Errorf("set _search_docs_calls: %w", err)
	}
	return result, nil
}

func appendExchange(state *State, probeAskedNow bool, in AppendExchangeArgs) (Result, error) {
	if probeAskedNow {
		return Result{}, ErrProbeNotAnswered
	}
	if in.Score < 1 || in.Score > 3 {
		return Result{}, ErrInvalidScore
	}
	if !validSkill(in.Skill) {
		return Result{}, fmt.Errorf("invalid skill %q: must be exactly remember, understand_apply, or analyze_evaluate", in.Skill)
	}
	if in.Citations == nil {
		in.Citations = []CaseSource{}
	}
	state.Transcript = append(state.Transcript, Exchange{Question: in.Question, Answer: in.Answer, Skillset: in.Skillset, Skill: in.Skill, Feedback: in.Feedback, IdealResponse: in.IdealResponse, Score: in.Score, Citations: in.Citations})
	state.Status = PhaseQuestioning
	state.LoadingStep = ""
	state.CurrentQuestion, state.ActiveFeedback, state.ActiveIdealResponse, state.ActiveProbe = "", "", "", ""
	state.SearchCalls = 0
	return Result{OK: true, Status: "success", Count: len(state.Transcript)}, nil
}

func SetScoreCard(ctx agent.Context, in ScoreCardArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setScoreCard(&state, in)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("score_card", state.ScoreCard); err != nil {
		return Result{}, fmt.Errorf("set score_card: %w", err)
	}
	if err := ctx.State().Set("score_summary", state.ScoreSummary); err != nil {
		return Result{}, fmt.Errorf("set score_summary: %w", err)
	}
	if err := ctx.State().Set("outcome", state.Outcome); err != nil {
		return Result{}, fmt.Errorf("set outcome: %w", err)
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, fmt.Errorf("set status: %w", err)
	}
	return result, nil
}

func setScoreCard(state *State, in ScoreCardArgs) (Result, error) {
	if strings.TrimSpace(in.Markdown) == "" {
		return Result{}, errors.New("score card is required")
	}
	if in.Outcome != "pass" && in.Outcome != "borderline" && in.Outcome != "not_yet" {
		return Result{}, errors.New("invalid outcome")
	}
	for _, score := range in.ScoreSummary {
		if score.Score < 1 || score.Score > 3 || !validSkill(score.Skill) {
			return Result{}, fmt.Errorf("invalid score summary item for %q: score must be 1, 2, or 3 and skill must be exactly remember, understand_apply, or analyze_evaluate", score.Skillset)
		}
	}
	if in.ScoreSummary == nil {
		in.ScoreSummary = []SkillsetScore{}
	}
	state.ScoreCard = in.Markdown
	state.ScoreSummary = in.ScoreSummary
	state.Outcome = in.Outcome
	state.Status = PhaseComplete
	return Result{OK: true, Status: "success", Length: len(in.Markdown)}, nil
}

func CompleteExamination(ctx agent.Context, _ struct{}) (Result, error) {
	state := readState(ctx.State())
	result, err := completeExamination(&state)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("interview_complete", state.InterviewComplete); err != nil {
		return Result{}, fmt.Errorf("set interview_complete: %w", err)
	}
	return result, nil
}

func completeExamination(state *State) (Result, error) {
	if len(state.Transcript) < MinimumInterviewExchanges {
		return Result{}, fmt.Errorf(
			"%w: %d of %d required scored exchanges recorded; ask %d more question(s)",
			ErrInterviewTooShort,
			len(state.Transcript),
			MinimumInterviewExchanges,
			MinimumInterviewExchanges-len(state.Transcript),
		)
	}
	state.InterviewComplete = true
	return Result{OK: true, Status: "success", Count: len(state.Transcript)}, nil
}

func validSkill(skill Skill) bool {
	return skill == SkillRemember || skill == SkillUnderstandApply || skill == SkillAnalyzeEvaluate
}

func RoutePhase(state State) string {
	if state.Status == PhaseFeedback {
		return "evaluator"
	}
	if state.Status == PhaseComplete {
		return "scorer"
	}
	if state.Status == PhaseIdle || state.Case == "" {
		return "case_builder"
	}
	return "questioner"
}

func QuestionCraftViolations(question string) []string {
	lower := strings.ToLower(question)
	violations := []string{}
	if strings.Contains(lower, " such as ") || strings.Contains(lower, " including ") || strings.Contains(lower, " for example") {
		violations = append(violations, "question leaks answer examples")
	}
	if strings.Count(question, "?") > 1 || questionStemCount(lower) > 1 {
		violations = append(violations, "question stacks multiple cognitive acts")
	}
	if len(strings.Fields(question)) > 30 {
		violations = append(violations, "question exceeds 30 words")
	}
	return violations
}

func questionStemCount(question string) int {
	stems := map[string]bool{"what": true, "how": true, "why": true, "which": true, "when": true, "where": true}
	count := 0
	for _, word := range strings.Fields(question) {
		word = strings.Trim(word, "\"'()[]{}.,:;!?")
		if stems[word] {
			count++
		}
	}
	return count
}
