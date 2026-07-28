package interview

import (
	"fmt"
	"math"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

const (
	maxTextLength = 10_000
	maxItems      = 20
)

type Result struct {
	OK       bool                          `json:"ok"`
	Status   Status                        `json:"status,omitempty"`
	Question *Question                     `json:"question,omitempty"`
	Feedback *QuestionFeedback             `json:"feedback,omitempty"`
	Hint     string                        `json:"hint,omitempty"`
	Error    *agentruntime.StructuredError `json:"error,omitempty"`
}

type ConfigureArgs struct {
	Track               Track         `json:"track"`
	TargetRole          string        `json:"target_role"`
	TargetLevel         string        `json:"target_level"`
	Topics              []string      `json:"topics"`
	Difficulty          Difficulty    `json:"difficulty"`
	CoachingStyle       CoachingStyle `json:"coaching_style"`
	TargetQuestionCount int           `json:"target_question_count"`
}

type SelectQuestionArgs struct{}

type RecordAttemptFeedbackArgs struct {
	AttemptSummary string        `json:"attempt_summary"`
	Rubric         []RubricScore `json:"rubric"`
	Feedback       string        `json:"feedback"`
	Strengths      []string      `json:"strengths"`
	Improvements   []string      `json:"improvements"`
	FollowUp       string        `json:"follow_up"`
	StoryNote      *StoryNote    `json:"story_note,omitempty"`
}

type RequestHintArgs struct{}

type CompleteInterviewArgs struct {
	SessionSummary string   `json:"session_summary"`
	NextSteps      []string `json:"next_steps"`
}

func Configure(ctx agent.Context, input ConfigureArgs) (Result, error) {
	state := readState(ctx.State())
	result := configure(&state, input)
	if !result.OK {
		return result, nil
	}
	return result, writeState(ctx, state)
}

func configure(state *State, input ConfigureArgs) Result {
	if input.Track != TrackBehavioral && input.Track != TrackCoding {
		return fail("invalid_track", "track must be behavioral or coding")
	}
	role := strings.TrimSpace(input.TargetRole)
	if role == "" {
		role = "Software Engineer"
	}
	if len(role) > 200 {
		return fail("invalid_target_role", "target role must be at most 200 characters")
	}
	level := strings.ToLower(strings.TrimSpace(input.TargetLevel))
	if level == "" {
		level = "mid"
	}
	if !oneOf(level, "entry", "mid", "senior", "staff") {
		return fail("invalid_target_level", "target level must be entry, mid, senior, or staff")
	}
	style := input.CoachingStyle
	if style == "" {
		style = StyleInterview
	}
	if style != StyleInterview && style != StyleGuided {
		return fail("invalid_coaching_style", "coaching style must be interview or guided")
	}
	difficulty := input.Difficulty
	if input.Track == TrackCoding {
		if difficulty == "" {
			difficulty = DifficultyMedium
		}
		if difficulty != DifficultyEasy && difficulty != DifficultyMedium && difficulty != DifficultyHard {
			return fail("invalid_difficulty", "coding difficulty must be easy, medium, or hard")
		}
	} else {
		difficulty = ""
	}
	count := input.TargetQuestionCount
	available := availableQuestionCount(input.Track, difficulty)
	if count == 0 {
		count = min(3, available)
	}
	if count < 1 || count > available {
		return fail("invalid_question_count", fmt.Sprintf("target question count must be between 1 and %d for this track and difficulty", available))
	}
	topics, result := cleanItems(input.Topics, false, "topics")
	if !result.OK {
		return result
	}

	*state = Defaults()
	state.Track = input.Track
	state.TargetRole = role
	state.TargetLevel = level
	state.Topics = topics
	state.Difficulty = difficulty
	state.CoachingStyle = style
	state.TargetQuestionCount = count
	state.Status = StatusPracticing
	return Result{OK: true, Status: state.Status}
}

func SelectQuestion(ctx agent.Context, _ SelectQuestionArgs) (Result, error) {
	state := readState(ctx.State())
	result := selectQuestion(&state)
	if !result.OK {
		return result, nil
	}
	return result, writeState(ctx, state)
}

func selectQuestion(state *State) Result {
	if state.Status == StatusIdle || (state.Track != TrackBehavioral && state.Track != TrackCoding) {
		return fail("interview_not_configured", "configure the interview before selecting a question")
	}
	if state.Status == StatusComplete {
		return fail("interview_complete", "configure a new interview to continue practicing")
	}
	if state.CurrentQuestion != nil && state.ActiveFeedback == nil {
		return fail("question_in_progress", "record feedback for the current question before selecting another")
	}
	if state.CompletedCount >= state.TargetQuestionCount {
		return fail("completion_required", "the target question count is complete; complete the interview")
	}

	used := make(map[string]bool, len(state.UsedQuestionIDs))
	for _, id := range state.UsedQuestionIDs {
		used[id] = true
	}
	candidates := matchingQuestions(*state, used, true)
	if len(candidates) == 0 {
		candidates = matchingQuestions(*state, used, false)
	}
	if len(candidates) == 0 {
		return fail("question_bank_exhausted", "no unused questions remain for this track")
	}

	selected := publicQuestion(candidates[0])
	state.CurrentQuestion = &selected
	state.ActiveFeedback = nil
	state.ActiveHint = ""
	state.HintLevel = 0
	state.UsedQuestionIDs = append(state.UsedQuestionIDs, selected.ID)
	state.Status = StatusPracticing
	return Result{OK: true, Status: state.Status, Question: state.CurrentQuestion}
}

func matchingQuestions(state State, used map[string]bool, applyTopicFilter bool) []bankQuestion {
	result := make([]bankQuestion, 0)
	for _, question := range questionBank {
		if question.Track != state.Track || used[question.ID] {
			continue
		}
		if state.Track == TrackCoding && state.Difficulty != "" && question.Difficulty != state.Difficulty {
			continue
		}
		if applyTopicFilter && !matchesTopics(question, state.Topics) {
			continue
		}
		result = append(result, question)
	}
	return result
}

func availableQuestionCount(track Track, difficulty Difficulty) int {
	count := 0
	for _, question := range questionBank {
		if question.Track != track {
			continue
		}
		if track == TrackCoding && question.Difficulty != difficulty {
			continue
		}
		count++
	}
	return count
}

func RecordAttemptFeedback(ctx agent.Context, input RecordAttemptFeedbackArgs) (Result, error) {
	state := readState(ctx.State())
	result := recordAttemptFeedback(&state, input)
	if !result.OK {
		return result, nil
	}
	return result, writeState(ctx, state)
}

func recordAttemptFeedback(state *State, input RecordAttemptFeedbackArgs) Result {
	if state.CurrentQuestion == nil {
		return fail("active_question_required", "select a question before recording feedback")
	}
	if state.ActiveFeedback != nil {
		return fail("feedback_already_recorded", "select the next question or complete the interview")
	}
	attempt := strings.TrimSpace(input.AttemptSummary)
	feedback := strings.TrimSpace(input.Feedback)
	followUp := strings.TrimSpace(input.FollowUp)
	if attempt == "" || len(attempt) > maxTextLength {
		return fail("invalid_attempt_summary", "attempt summary is required and must be at most 10,000 characters")
	}
	if feedback == "" || len(feedback) > maxTextLength {
		return fail("invalid_feedback", "feedback is required and must be at most 10,000 characters")
	}
	if len(followUp) > maxTextLength {
		return fail("invalid_follow_up", "follow-up must be at most 10,000 characters")
	}
	if state.CurrentQuestion.Track == TrackBehavioral && containsExampleMarker(feedback, followUp) {
		return fail("behavioral_example_not_allowed", "feedback must ask for actual missing facts without illustrative examples or sample quantities")
	}
	rubric, average, result := cleanRubric(state.CurrentQuestion.Track, input.Rubric)
	if !result.OK {
		return result
	}
	strengths, result := cleanItems(input.Strengths, true, "strengths")
	if !result.OK {
		return result
	}
	improvements, result := cleanItems(input.Improvements, true, "improvements")
	if !result.OK {
		return result
	}
	if state.CurrentQuestion.Track == TrackBehavioral && containsExampleMarker(append(input.Strengths, input.Improvements...)...) {
		return fail("behavioral_example_not_allowed", "strengths and improvements must not include illustrative examples or sample quantities")
	}
	storyNote, result := cleanStoryNote(state.CurrentQuestion.Track, input.StoryNote)
	if !result.OK {
		return result
	}

	entry := QuestionFeedback{
		QuestionID: state.CurrentQuestion.ID, QuestionTitle: state.CurrentQuestion.Title,
		AttemptSummary: attempt, Rubric: rubric, OverallScore: average, Feedback: feedback,
		Strengths: strengths, Improvements: improvements, FollowUp: followUp, StoryNote: storyNote,
	}
	state.History = append(state.History, entry)
	state.ActiveFeedback = &state.History[len(state.History)-1]
	state.CompletedCount = len(state.History)
	state.AverageScore = averageScore(state.History)
	state.Status = StatusFeedback
	return Result{OK: true, Status: state.Status, Feedback: state.ActiveFeedback}
}

func RequestHint(ctx agent.Context, _ RequestHintArgs) (Result, error) {
	state := readState(ctx.State())
	result := requestHint(&state)
	if !result.OK {
		return result, nil
	}
	return result, writeState(ctx, state)
}

func requestHint(state *State) Result {
	if state.CurrentQuestion == nil {
		return fail("active_question_required", "select a coding question before requesting a hint")
	}
	if state.CurrentQuestion.Track != TrackCoding {
		return fail("coding_question_required", "progressive hints are only available for coding questions")
	}
	if state.ActiveFeedback != nil {
		return fail("question_already_scored", "select another coding question before requesting a hint")
	}
	question, ok := bankQuestionByID(state.CurrentQuestion.ID)
	if !ok || len(question.Hints) == 0 {
		return fail("hints_unavailable", "no progressive hints are available for this question")
	}
	if state.HintLevel >= len(question.Hints) {
		return fail("hint_limit_reached", "all progressive hints for this question have been used")
	}
	state.ActiveHint = question.Hints[state.HintLevel]
	state.HintLevel++
	return Result{OK: true, Status: state.Status, Hint: state.ActiveHint}
}

func CompleteInterview(ctx agent.Context, input CompleteInterviewArgs) (Result, error) {
	state := readState(ctx.State())
	result := completeInterview(&state, input)
	if !result.OK {
		return result, nil
	}
	return result, writeState(ctx, state)
}

func completeInterview(state *State, input CompleteInterviewArgs) Result {
	if state.TargetQuestionCount == 0 || state.Status == StatusIdle {
		return fail("interview_not_configured", "configure an interview before completing it")
	}
	if state.CompletedCount < state.TargetQuestionCount {
		return fail("interview_too_short", fmt.Sprintf("complete %d more question(s) before finishing", state.TargetQuestionCount-state.CompletedCount))
	}
	summary := strings.TrimSpace(input.SessionSummary)
	if summary == "" || len(summary) > maxTextLength {
		return fail("invalid_session_summary", "session summary is required and must be at most 10,000 characters")
	}
	nextSteps, result := cleanItems(input.NextSteps, true, "next_steps")
	if !result.OK {
		return result
	}
	if state.Track == TrackBehavioral && containsExampleMarker(append([]string{summary}, nextSteps...)...) {
		return fail("behavioral_example_not_allowed", "session summary and next steps must ask for actual facts without illustrative examples or sample quantities")
	}
	state.SessionSummary = summary
	state.NextSteps = nextSteps
	state.Status = StatusComplete
	state.CurrentQuestion = nil
	state.ActiveFeedback = nil
	state.ActiveHint = ""
	state.HintLevel = 0
	return Result{OK: true, Status: state.Status}
}

func cleanRubric(track Track, values []RubricScore) ([]RubricScore, float64, Result) {
	required := []string{"structure", "specificity", "impact", "reflection"}
	if track == TrackCoding {
		required = []string{"problem_solving", "correctness", "complexity", "communication"}
	}
	if len(values) != len(required) {
		return nil, 0, fail("invalid_rubric", "rubric must contain each required dimension exactly once")
	}
	allowed := make(map[string]bool, len(required))
	for _, dimension := range required {
		allowed[dimension] = true
	}
	seen := make(map[string]bool, len(values))
	cleaned := make([]RubricScore, 0, len(values))
	total := 0
	for _, value := range values {
		value.Dimension = strings.ToLower(strings.TrimSpace(value.Dimension))
		value.Evidence = strings.TrimSpace(value.Evidence)
		if !allowed[value.Dimension] || seen[value.Dimension] || value.Score < 1 || value.Score > 5 || value.Evidence == "" || len(value.Evidence) > maxTextLength {
			return nil, 0, fail("invalid_rubric", "rubric dimensions must be unique, score 1-5, and include concrete evidence")
		}
		seen[value.Dimension] = true
		total += value.Score
		cleaned = append(cleaned, value)
	}
	return cleaned, float64(total) / float64(len(cleaned)), Result{OK: true}
}

func cleanStoryNote(track Track, value *StoryNote) (*StoryNote, Result) {
	if value == nil {
		return nil, Result{OK: true}
	}
	if track != TrackBehavioral {
		return nil, fail("behavioral_story_only", "story notes may only be saved for behavioral questions")
	}
	title := strings.TrimSpace(value.Title)
	if title == "" || len(title) > 200 {
		return nil, fail("invalid_story_note", "story note title is required and must be at most 200 characters")
	}
	facts, result := cleanItems(value.Facts, true, "story_facts")
	if !result.OK {
		return nil, result
	}
	return &StoryNote{Title: title, Facts: facts}, Result{OK: true}
}

func cleanItems(values []string, required bool, field string) ([]string, Result) {
	if len(values) > maxItems {
		return nil, fail("too_many_"+field, field+" cannot contain more than 20 items")
	}
	cleaned := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > maxTextLength {
			return nil, fail("invalid_"+field, field+" must contain only non-empty values within the length limit")
		}
		key := strings.ToLower(value)
		if !seen[key] {
			seen[key] = true
			cleaned = append(cleaned, value)
		}
	}
	if required && len(cleaned) == 0 {
		return nil, fail(field+"_required", "provide at least one "+strings.ReplaceAll(field, "_", " "))
	}
	return cleaned, Result{OK: true}
}

func averageScore(history []QuestionFeedback) float64 {
	if len(history) == 0 {
		return 0
	}
	total := 0.0
	for _, entry := range history {
		total += entry.OverallScore
	}
	return math.Round(total/float64(len(history))*100) / 100
}

func containsExampleMarker(values ...string) bool {
	for _, value := range values {
		lower := strings.ToLower(value)
		if strings.Contains(lower, "e.g.") || strings.Contains(lower, "for example") ||
			strings.Contains(lower, "such as a made-up") || strings.Contains(lower, "sample metric") {
			return true
		}
	}
	return false
}

func writeState(ctx agent.Context, state State) error {
	for key, value := range map[string]any{
		"track": state.Track, "target_role": state.TargetRole, "target_level": state.TargetLevel,
		"topics": state.Topics, "difficulty": state.Difficulty, "coaching_style": state.CoachingStyle,
		"target_question_count": state.TargetQuestionCount, "current_question": state.CurrentQuestion,
		"active_feedback": state.ActiveFeedback, "history": state.History,
		"used_question_ids": state.UsedQuestionIDs, "hint_level": state.HintLevel,
		"active_hint": state.ActiveHint, "completed_count": state.CompletedCount,
		"average_score": state.AverageScore, "status": state.Status,
		"session_summary": state.SessionSummary, "next_steps": state.NextSteps,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return err
		}
	}
	return nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
