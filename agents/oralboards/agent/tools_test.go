package oralboards

import (
	"errors"
	"testing"
)

func TestRoutePhase(t *testing.T) {
	cases := []struct {
		state State
		want  string
	}{
		{State{}, "case_builder"},
		{State{Case: "case", Status: "feedback"}, "evaluator"},
		{State{Case: "case", Status: "complete"}, "scorer"},
		{State{Case: "case", Status: "questioning"}, "questioner"},
	}
	for _, test := range cases {
		if got := RoutePhase(test.state); got != test.want {
			t.Fatalf("RoutePhase(%#v)=%q want %q", test.state, got, test.want)
		}
	}
}

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
	if _, err := askProbe(&state, ProbeArgs{Question: "What supports that decision?"}); err != nil {
		t.Fatal(err)
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
