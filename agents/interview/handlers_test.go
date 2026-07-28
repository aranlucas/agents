package interview

import (
	"strings"
	"testing"
)

func TestConfigureDefaultsAndResetsSession(t *testing.T) {
	state := State{
		History: []QuestionFeedback{{QuestionID: "old"}}, Status: StatusComplete,
	}
	result := configure(&state, ConfigureArgs{Track: TrackCoding, Topics: []string{"graphs"}})
	if !result.OK {
		t.Fatalf("configure = %#v", result)
	}
	if state.TargetRole != "Software Engineer" || state.TargetLevel != "mid" ||
		state.Difficulty != DifficultyMedium || state.CoachingStyle != StyleInterview ||
		state.TargetQuestionCount != 3 || state.Status != StatusPracticing {
		t.Fatalf("defaults = %#v", state)
	}
	if len(state.History) != 0 || state.Topics[0] != "graphs" {
		t.Fatalf("reset state = %#v", state)
	}
}

func TestConfigureRejectsMoreQuestionsThanTheFilteredBank(t *testing.T) {
	state := Defaults()
	result := configure(&state, ConfigureArgs{
		Track: TrackCoding, Difficulty: DifficultyHard, TargetQuestionCount: 2,
	})
	if result.OK || result.Error.Code != "invalid_question_count" {
		t.Fatalf("configure oversized hard session = %#v", result)
	}
}

func TestSelectQuestionFiltersAndDoesNotRepeat(t *testing.T) {
	state := Defaults()
	if result := configure(&state, ConfigureArgs{
		Track: TrackCoding, Topics: []string{"graphs"}, Difficulty: DifficultyMedium,
		TargetQuestionCount: 2,
	}); !result.OK {
		t.Fatal(result.Error)
	}
	first := selectQuestion(&state)
	if !first.OK || first.Question == nil || first.Question.Topic != "graphs" {
		t.Fatalf("first question = %#v", first)
	}
	if repeated := selectQuestion(&state); repeated.OK || repeated.Error.Code != "question_in_progress" {
		t.Fatalf("repeated selection = %#v", repeated)
	}
	state.ActiveFeedback = &QuestionFeedback{QuestionID: first.Question.ID}
	state.CompletedCount = 1
	second := selectQuestion(&state)
	if !second.OK || second.Question == nil || second.Question.ID == first.Question.ID {
		t.Fatalf("second question = %#v", second)
	}
}

func TestHintsAreProgressiveAndBounded(t *testing.T) {
	state := Defaults()
	if result := configure(&state, ConfigureArgs{Track: TrackCoding, Topics: []string{"arrays"}, Difficulty: DifficultyEasy}); !result.OK {
		t.Fatal(result.Error)
	}
	if result := selectQuestion(&state); !result.OK {
		t.Fatal(result.Error)
	}
	var hints []string
	for {
		result := requestHint(&state)
		if !result.OK {
			if result.Error.Code != "hint_limit_reached" {
				t.Fatalf("hint error = %#v", result)
			}
			break
		}
		hints = append(hints, result.Hint)
	}
	if len(hints) != 3 || hints[0] == hints[1] || state.HintLevel != 3 {
		t.Fatalf("hints = %#v level=%d", hints, state.HintLevel)
	}
}

func TestRecordFeedbackValidatesTrackRubricAndComputesAverage(t *testing.T) {
	state := Defaults()
	if result := configure(&state, ConfigureArgs{Track: TrackBehavioral, TargetQuestionCount: 1}); !result.OK {
		t.Fatal(result.Error)
	}
	if result := selectQuestion(&state); !result.OK {
		t.Fatal(result.Error)
	}
	input := RecordAttemptFeedbackArgs{
		AttemptSummary: "I described a disagreement and the decision process.",
		Rubric: []RubricScore{
			{Dimension: "structure", Score: 4, Evidence: "The answer had a clear beginning and result."},
			{Dimension: "specificity", Score: 3, Evidence: "The actions were concrete but lacked dates."},
			{Dimension: "impact", Score: 5, Evidence: "The user quantified the launch outcome."},
			{Dimension: "reflection", Score: 4, Evidence: "The answer named a changed practice."},
		},
		Feedback:     "Strong ownership with room for more context.",
		Strengths:    []string{"Clear personal actions"},
		Improvements: []string{"State the initial stakes sooner"},
		FollowUp:     "What resistance did you encounter?",
		StoryNote:    &StoryNote{Title: "Architecture disagreement", Facts: []string{"The user proposed a smaller rollout."}},
	}
	result := recordAttemptFeedback(&state, input)
	if !result.OK || state.CompletedCount != 1 || state.AverageScore != 4 || state.Status != StatusFeedback {
		t.Fatalf("record feedback = %#v state=%#v", result, state)
	}
	if len(state.History) != 1 || state.History[0].StoryNote == nil {
		t.Fatalf("history = %#v", state.History)
	}
}

func TestBehavioralFeedbackRejectsIllustrativeFacts(t *testing.T) {
	state := Defaults()
	if result := configure(&state, ConfigureArgs{Track: TrackBehavioral, TargetQuestionCount: 1}); !result.OK {
		t.Fatal(result.Error)
	}
	if result := selectQuestion(&state); !result.OK {
		t.Fatal(result.Error)
	}
	result := recordAttemptFeedback(&state, RecordAttemptFeedbackArgs{
		AttemptSummary: "I proposed a staged rollout.",
		Rubric: []RubricScore{
			{Dimension: "structure", Score: 2, Evidence: "The context was brief."},
			{Dimension: "specificity", Score: 2, Evidence: "The action lacked detail."},
			{Dimension: "impact", Score: 1, Evidence: "No measured result was supplied."},
			{Dimension: "reflection", Score: 1, Evidence: "No learning was supplied."},
		},
		Feedback:     "Add an invented metric, e.g. 10,000 users.",
		Strengths:    []string{"Named a personal action"},
		Improvements: []string{"Ask what impact was actually measured"},
	})
	if result.OK || result.Error.Code != "behavioral_example_not_allowed" {
		t.Fatalf("illustrative feedback = %#v", result)
	}
}

func TestCompleteInterviewEnforcesQuestionCount(t *testing.T) {
	state := Defaults()
	if result := configure(&state, ConfigureArgs{Track: TrackBehavioral, TargetQuestionCount: 2}); !result.OK {
		t.Fatal(result.Error)
	}
	if result := completeInterview(&state, CompleteInterviewArgs{SessionSummary: "Good", NextSteps: []string{"Practice impact"}}); result.OK || result.Error.Code != "interview_too_short" {
		t.Fatalf("early completion = %#v", result)
	}
	state.CompletedCount = 2
	state.History = []QuestionFeedback{{OverallScore: 3}, {OverallScore: 4}}
	result := completeInterview(&state, CompleteInterviewArgs{
		SessionSummary: "Two answers showed clear ownership.",
		NextSteps:      []string{"Quantify impact", "Tighten the opening"},
	})
	if !result.OK || state.Status != StatusComplete || state.CurrentQuestion != nil || len(state.NextSteps) != 2 {
		t.Fatalf("completion = %#v state=%#v", result, state)
	}
}

func TestQuestionBankUsesOriginalPromptsAndHasBothTracks(t *testing.T) {
	counts := map[Track]int{}
	ids := map[string]bool{}
	for _, question := range questionBank {
		counts[question.Track]++
		if question.ID == "" || ids[question.ID] || strings.TrimSpace(question.Prompt) == "" {
			t.Fatalf("invalid question = %#v", question)
		}
		ids[question.ID] = true
		if question.Track == TrackCoding && len(question.Hints) < 2 {
			t.Fatalf("coding question lacks progressive hints: %#v", question)
		}
	}
	if counts[TrackBehavioral] < 6 || counts[TrackCoding] < 6 {
		t.Fatalf("question counts = %#v", counts)
	}
}
