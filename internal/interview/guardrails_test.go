package interview

import (
	"testing"

	"google.golang.org/genai"
)

func TestGuardedReplacementBlocksPrematureCodingSolution(t *testing.T) {
	state := Defaults()
	state.Track = TrackCoding
	state.CurrentQuestion = &Question{ID: "service-order"}

	got := guardedReplacement(state, "Solution overview\n```python\nclass Solution:\n    pass\n```")
	if got == "" {
		t.Fatal("expected premature solution to be blocked")
	}
	if looksLikeCodingSolutionLeak(got) {
		t.Fatalf("guarded response still looks like a solution leak: %q", got)
	}
}

func TestGuardedReplacementAllowsInterviewPromptAndHint(t *testing.T) {
	state := Defaults()
	state.Track = TrackCoding
	state.CurrentQuestion = &Question{ID: "service-order"}

	for _, text := range []string{
		"What clarifying questions would you ask before choosing a data structure?",
		"Hint: model each service as a node and each dependency as a directed edge.",
	} {
		if got := guardedReplacement(state, text); got != "" {
			t.Fatalf("guardedReplacement(%q) = %q, want unchanged", text, got)
		}
	}
}

func TestGuardedReplacementAllowsOnlyTheRequestedAlgorithmHint(t *testing.T) {
	state := Defaults()
	state.Track = TrackCoding
	state.CurrentQuestion = &Question{ID: "log-hops"}
	state.ActiveHint = "Use breadth-first search and mark a node visited when it enters the queue."

	if got := guardedReplacement(state, "Hint: "+state.ActiveHint); got != "" {
		t.Fatalf("requested hint was blocked: %q", got)
	}
	if got := guardedReplacement(state, "Use breadth-first search to solve this."); got == "" {
		t.Fatal("unrequested algorithm disclosure was not blocked")
	}
}

func TestGuardedReplacementAllowsSolutionAfterScoredAttempt(t *testing.T) {
	state := Defaults()
	state.Track = TrackCoding
	state.CurrentQuestion = &Question{ID: "service-order"}
	state.ActiveFeedback = &QuestionFeedback{QuestionID: "service-order"}

	if got := guardedReplacement(state, "Here is the solution:\n```go\nfunc solution() {}\n```"); got != "" {
		t.Fatalf("scored attempt response was blocked: %q", got)
	}
}

func TestGuardedReplacementBlocksInventedBehavioralMetrics(t *testing.T) {
	state := Defaults()
	state.Track = TrackBehavioral
	state.Status = StatusFeedback

	got := guardedReplacement(state, "Add impact, for example 25% less downtime.")
	if got == "" {
		t.Fatal("expected illustrative metric to be blocked")
	}
	if looksLikeIllustrativeBehavioralMetric(got) {
		t.Fatalf("guarded response still includes illustrative metrics: %q", got)
	}
}

func TestHasFunctionCall(t *testing.T) {
	content := &genai.Content{Parts: []*genai.Part{{
		FunctionCall: &genai.FunctionCall{Name: "select_question"},
	}}}
	if !hasFunctionCall(content) {
		t.Fatal("expected function call to be detected")
	}
}
