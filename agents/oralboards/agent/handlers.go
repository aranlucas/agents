package oralboards

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"agents/internal/agentruntime"
)

var (
	ErrProbeAlreadyUsed = errors.New("probe already used for this question")
	ErrProbeNotAnswered = errors.New("cannot score in the same turn as a probe")
	ErrInvalidPhase     = errors.New("invalid oralboards phase")
	ErrInvalidScore     = errors.New("oralboards score must be 1, 2, or 3")
)

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
	Phase string `json:"phase"`
}
type LoadingArgs struct {
	Step string `json:"step"`
}
type TargetArgs struct {
	Skillset string `json:"skillset"`
	Skill    Skill  `json:"skill"`
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

func SetCase(_ context.Context, tx *agentruntime.Transaction, in SetCaseArgs) (Result, error) {
	if tx == nil || strings.TrimSpace(in.Case) == "" {
		return Result{}, errors.New("case is required")
	}
	if in.CaseSources == nil {
		in.CaseSources = []CaseSource{}
	}
	if in.CasePassages == nil {
		in.CasePassages = []string{}
	}
	tx.Set("case", in.Case)
	tx.Set("case_sources", in.CaseSources)
	tx.Set("case_passages", strings.Join(in.CasePassages, "\n\n---\n\n"))
	tx.Set("interview_complete", false)
	tx.Set("status", "presenting")
	tx.Set("_search_docs_calls", 0)
	return Result{OK: true, Status: "success", Length: len(in.Case)}, nil
}

func SetPhase(_ context.Context, tx *agentruntime.Transaction, in SetPhaseArgs) (Result, error) {
	switch in.Phase {
	case "presenting", "questioning", "complete":
	default:
		return Result{}, ErrInvalidPhase
	}
	tx.Set("status", in.Phase)
	return Result{OK: true, Status: "success"}, nil
}

func SetLoadingStep(_ context.Context, tx *agentruntime.Transaction, in LoadingArgs) (Result, error) {
	if tx == nil {
		return Result{}, errors.New("transaction is required")
	}
	tx.Set("loading_step", strings.TrimSpace(in.Step))
	return Result{OK: true, Status: "success"}, nil
}

func SetQuestionTarget(_ context.Context, tx *agentruntime.Transaction, in TargetArgs) (Result, error) {
	if strings.TrimSpace(in.Skillset) == "" || !validSkill(in.Skill) {
		return Result{}, errors.New("valid skillset and skill are required")
	}
	tx.Set("target_skillset", in.Skillset)
	tx.Set("target_skill", in.Skill)
	return Result{OK: true, Status: "success"}, nil
}

func AskProbe(_ context.Context, tx *agentruntime.Transaction, in ProbeArgs) (Result, error) {
	state := decodeState(tx)
	if state.ActiveProbe != "" {
		return Result{}, ErrProbeAlreadyUsed
	}
	question := strings.TrimSpace(in.Question)
	if question == "" {
		return Result{}, errors.New("probe question is required")
	}
	tx.Set("active_probe", question)
	tx.Set("current_question", question)
	tx.Set("_search_docs_calls", 0)
	tx.Set("temp:probe_asked_now", true)
	return Result{OK: true, Status: "success", Message: "Probe question displayed."}, nil
}

func AppendExchange(_ context.Context, tx *agentruntime.Transaction, in AppendExchangeArgs) (Result, error) {
	if value, _ := tx.Get("temp:probe_asked_now"); value == true {
		return Result{}, ErrProbeNotAnswered
	}
	if in.Score < 1 || in.Score > 3 {
		return Result{}, ErrInvalidScore
	}
	if !validSkill(in.Skill) {
		return Result{}, errors.New("invalid skill")
	}
	state := decodeState(tx)
	if in.Citations == nil {
		in.Citations = []CaseSource{}
	}
	state.Transcript = append(state.Transcript, Exchange{Question: in.Question, Answer: in.Answer, Skillset: in.Skillset, Skill: in.Skill, Feedback: in.Feedback, IdealResponse: in.IdealResponse, Score: in.Score, Citations: in.Citations})
	tx.Set("transcript", state.Transcript)
	tx.Set("status", "questioning")
	for _, key := range []string{"current_question", "active_feedback", "active_ideal_response", "active_probe", "target_skillset", "target_skill"} {
		tx.Set(key, "")
	}
	tx.Set("_search_docs_calls", 0)
	return Result{OK: true, Status: "success", Count: len(state.Transcript)}, nil
}

func SetScoreCard(_ context.Context, tx *agentruntime.Transaction, in ScoreCardArgs) (Result, error) {
	if strings.TrimSpace(in.Markdown) == "" {
		return Result{}, errors.New("score card is required")
	}
	if in.Outcome != "pass" && in.Outcome != "borderline" && in.Outcome != "not_yet" {
		return Result{}, errors.New("invalid outcome")
	}
	for _, score := range in.ScoreSummary {
		if score.Score < 1 || score.Score > 3 || !validSkill(score.Skill) {
			return Result{}, fmt.Errorf("%w in summary", ErrInvalidScore)
		}
	}
	if in.ScoreSummary == nil {
		in.ScoreSummary = []SkillsetScore{}
	}
	tx.Set("score_card", in.Markdown)
	tx.Set("score_summary", in.ScoreSummary)
	tx.Set("outcome", in.Outcome)
	tx.Set("status", "complete")
	return Result{OK: true, Status: "success", Length: len(in.Markdown)}, nil
}

func CompleteExamination(_ context.Context, tx *agentruntime.Transaction, _ struct{}) (Result, error) {
	tx.Set("interview_complete", true)
	return Result{OK: true, Status: "success"}, nil
}

func validSkill(skill Skill) bool {
	return skill == SkillRemember || skill == SkillUnderstandApply || skill == SkillAnalyzeEvaluate
}

func RoutePhase(state State) string {
	if state.Status == "feedback" {
		return "evaluator"
	}
	if state.Status == "complete" {
		return "scorer"
	}
	if state.Status == "idle" || state.Case == "" {
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
	if strings.Count(question, "?") > 1 || (strings.Contains(lower, " and ") && (strings.Contains(lower, "what ") || strings.Contains(lower, "how "))) {
		violations = append(violations, "question stacks multiple cognitive acts")
	}
	if len(strings.Fields(question)) > 30 {
		violations = append(violations, "question exceeds 30 words")
	}
	return violations
}
