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

func TestInvalidScoreDoesNotMutateTranscript(t *testing.T) {
	state := Defaults()
	_, err := appendExchange(&state, false, AppendExchangeArgs{Skill: SkillRemember, Score: 4})
	if !errors.Is(err, ErrInvalidScore) || len(state.Transcript) != 0 {
		t.Fatalf("error=%v state=%#v", err, state)
	}
}
