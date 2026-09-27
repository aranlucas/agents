package oralboards

import (
	"errors"
	"testing"
)

func TestQuestionCraftRejectsStackedAndAnswerLeakingQuestions(t *testing.T) {
	for _, question := range []string{
		"What findings would you seek and how would they change your plan?",
		"What diagnosis would you make, such as early childhood caries?",
	} {
		if len(QuestionCraftViolations(question)) == 0 {
			t.Fatalf("question accepted: %q", question)
		}
	}
}

func TestQuestionCraftAllowsSingleActWithCompoundClinicalNouns(t *testing.T) {
	question := "What factors in this child's history and examination explain the observed findings?"
	if violations := QuestionCraftViolations(question); len(violations) != 0 {
		t.Fatalf("violations = %v", violations)
	}
}

func TestProbePreventsScoringInSameTurn(t *testing.T) {
	state := Defaults()
	state.LoadingStep = "Assessing answer and drafting exchange."
	if _, err := askProbe(&state, ProbeArgs{Question: "What supports that decision?"}); err != nil {
		t.Fatal(err)
	}
	if state.LoadingStep != "" {
		t.Fatalf("loading step = %q, want cleared while awaiting probe answer", state.LoadingStep)
	}
	_, err := appendExchange(&state, true, AppendExchangeArgs{Skill: SkillAnalyzeEvaluate, Score: 2})
	if !errors.Is(err, ErrProbeNotAnswered) {
		t.Fatalf("error = %v", err)
	}
}

func TestQuestionAllowsAtMostOneProbeAfterScoring(t *testing.T) {
	state := Defaults()
	if _, err := askProbe(&state, ProbeArgs{Question: "What supports that decision?"}); err != nil {
		t.Fatal(err)
	}
	if _, err := appendExchange(&state, false, AppendExchangeArgs{Skill: SkillAnalyzeEvaluate, Score: 3}); err != nil {
		t.Fatal(err)
	}
	if _, err := askProbe(&state, ProbeArgs{Question: "What else?"}); !errors.Is(err, ErrProbeAlreadyUsed) {
		t.Fatalf("second probe error = %v, want %v", err, ErrProbeAlreadyUsed)
	}
}

func TestInvalidScoreDoesNotMutateTranscript(t *testing.T) {
	state := Defaults()
	_, err := appendExchange(&state, false, AppendExchangeArgs{Skill: SkillRemember, Score: 4})
	if !errors.Is(err, ErrInvalidScore) || len(state.Transcript) != 0 {
		t.Fatalf("error=%v state=%#v", err, state)
	}
}

func TestExaminationCannotCompleteBeforeFullInterview(t *testing.T) {
	state := Defaults()
	state.Transcript = make([]Exchange, MinimumInterviewExchanges-1)

	_, err := completeExamination(&state)
	if !errors.Is(err, ErrInterviewTooShort) {
		t.Fatalf("error = %v, want %v", err, ErrInterviewTooShort)
	}
	if state.InterviewComplete {
		t.Fatal("short interview was marked complete")
	}
}

func TestExaminationCanCompleteAfterMinimumFullInterview(t *testing.T) {
	state := Defaults()
	state.Transcript = make([]Exchange, MinimumInterviewExchanges)

	result, err := completeExamination(&state)
	if err != nil {
		t.Fatal(err)
	}
	if !state.InterviewComplete || result.Count != MinimumInterviewExchanges {
		t.Fatalf("state=%#v result=%#v", state, result)
	}
}

func TestCaseVignetteRejectsEmbeddedExamQuestion(t *testing.T) {
	state := Defaults()
	_, err := setCase(&state, SetCaseArgs{Case: "A child presents with deep caries. What would you do?"})
	if err == nil || state.Case != "" {
		t.Fatalf("error=%v state=%#v", err, state)
	}
}

func TestCaseVignetteRejectsUnrealizedImagePlaceholder(t *testing.T) {
	state := Defaults()
	_, err := setCase(&state, SetCaseArgs{Case: "A child presents with deep caries. [Insert Image 1: Bitewing]"})
	if err == nil || state.Case != "" {
		t.Fatalf("error=%v state=%#v", err, state)
	}
}
