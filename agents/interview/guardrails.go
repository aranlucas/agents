package interview

import (
	"strings"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

const fullSolutionMarkerCount = 12

var codingSolutionMarkers = []string{
	"```",
	"reference implementation",
	"complete implementation",
	"full implementation",
	"solution overview",
	"here is the solution",
	"here's the solution",
	"step-by-step solution",
	"optimal solution",
	"def solution",
	"class solution",
	"func solution",
	"use a hash map",
	"use a hashmap",
	"topological sort",
	"kahn's algorithm",
	"breadth-first search",
	"doubly linked list",
}

var illustrativeMetricMarkers = []string{
	"%",
	"$",
	" users",
	" customers",
	" minutes",
	" hours",
	" downtime",
	" outage",
	" revenue",
}

// enforceInterviewOutput is a final safety boundary for providers that ignore
// the interview instructions. Tool calls are always preserved. Plain-text
// coding solutions are suppressed until an attempt has been scored, and
// behavioral feedback cannot introduce illustrative metrics as if they were
// the candidate's facts.
func enforceInterviewOutput(ctx agent.Context, response *model.LLMResponse, responseErr error) (*model.LLMResponse, error) {
	if responseErr != nil || response == nil || response.Content == nil || hasFunctionCall(response.Content) {
		return nil, nil
	}

	state := readState(ctx.State())
	text := responseText(response.Content)
	replacement := guardedReplacement(state, text)
	if replacement == "" {
		return nil, nil
	}

	guarded := *response
	guarded.Content = genai.NewContentFromText(replacement, genai.RoleModel)
	return &guarded, nil
}

func guardedReplacement(state State, text string) string {
	if state.Track == TrackCoding &&
		state.CurrentQuestion != nil &&
		state.ActiveFeedback == nil &&
		looksLikeCodingSolutionLeak(text) {
		if isRequestedHintNarration(text, state.ActiveHint) {
			return ""
		}
		return "Let’s keep this in interview mode: I won’t reveal a solution before your attempt. Start by explaining your understanding, clarifying questions, and initial approach. You can ask for one progressive hint if you get stuck."
	}

	if state.Track == TrackBehavioral && looksLikeIllustrativeBehavioralMetric(text) {
		if state.Status == StatusComplete {
			return "Your session is complete. The evidence-based summary and next steps are saved on the practice board."
		}
		return "Your evidence-based feedback is saved on the practice board. Add your actual missing impact or reflection details rather than sample metrics."
	}

	return ""
}

func looksLikeCodingSolutionLeak(text string) bool {
	normalized := strings.ToLower(text)
	for _, marker := range codingSolutionMarkers {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

func isRequestedHintNarration(text, activeHint string) bool {
	normalizedHint := strings.ToLower(strings.TrimSpace(activeHint))
	normalizedText := strings.ToLower(strings.TrimSpace(text))
	if normalizedHint == "" || !strings.Contains(normalizedText, normalizedHint) {
		return false
	}
	if len(normalizedText) > len(normalizedHint)+80 {
		return false
	}
	for _, marker := range codingSolutionMarkers[:fullSolutionMarkerCount] {
		if strings.Contains(normalizedText, marker) {
			return false
		}
	}
	return true
}

func looksLikeIllustrativeBehavioralMetric(text string) bool {
	normalized := strings.ToLower(text)
	if !strings.Contains(normalized, "e.g.") && !strings.Contains(normalized, "for example") {
		return false
	}
	for _, marker := range illustrativeMetricMarkers {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

func hasFunctionCall(content *genai.Content) bool {
	for _, part := range content.Parts {
		if part != nil && part.FunctionCall != nil {
			return true
		}
	}
	return false
}

func responseText(content *genai.Content) string {
	var text strings.Builder
	for _, part := range content.Parts {
		if part != nil && !part.Thought {
			text.WriteString(part.Text)
		}
	}
	return text.String()
}
