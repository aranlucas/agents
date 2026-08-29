package interview

import (
	"encoding/json"
	"maps"

	"google.golang.org/adk/v2/session"
)

const AppName = "interview_coach_agent"

type Track string

const (
	TrackBehavioral Track = "behavioral"
	TrackCoding     Track = "coding"
)

type Difficulty string

const (
	DifficultyEasy   Difficulty = "easy"
	DifficultyMedium Difficulty = "medium"
	DifficultyHard   Difficulty = "hard"
)

type CoachingStyle string

const (
	StyleInterview CoachingStyle = "interview"
	StyleGuided    CoachingStyle = "guided"
)

type Status string

const (
	StatusIdle       Status = "idle"
	StatusPracticing Status = "practicing"
	StatusFeedback   Status = "feedback"
	StatusComplete   Status = "complete"
)

type Question struct {
	ID          string     `json:"id"`
	Track       Track      `json:"track"`
	Title       string     `json:"title"`
	Prompt      string     `json:"prompt"`
	Topic       string     `json:"topic"`
	Competency  string     `json:"competency"`
	Difficulty  Difficulty `json:"difficulty"`
	Examples    []string   `json:"examples"`
	Constraints []string   `json:"constraints"`
}

type RubricScore struct {
	Dimension string `json:"dimension"`
	Score     int    `json:"score"`
	Evidence  string `json:"evidence"`
}

type StoryNote struct {
	Title string   `json:"title"`
	Facts []string `json:"facts"`
}

type QuestionFeedback struct {
	QuestionID     string        `json:"question_id"`
	QuestionTitle  string        `json:"question_title"`
	AttemptSummary string        `json:"attempt_summary"`
	Rubric         []RubricScore `json:"rubric"`
	OverallScore   float64       `json:"overall_score"`
	Feedback       string        `json:"feedback"`
	Strengths      []string      `json:"strengths"`
	Improvements   []string      `json:"improvements"`
	FollowUp       string        `json:"follow_up"`
	StoryNote      *StoryNote    `json:"story_note,omitempty"`
}

type State struct {
	Track               Track              `json:"track"`
	TargetRole          string             `json:"target_role"`
	TargetLevel         string             `json:"target_level"`
	Topics              []string           `json:"topics"`
	Difficulty          Difficulty         `json:"difficulty"`
	CoachingStyle       CoachingStyle      `json:"coaching_style"`
	TargetQuestionCount int                `json:"target_question_count"`
	CurrentQuestion     *Question          `json:"current_question"`
	ActiveFeedback      *QuestionFeedback  `json:"active_feedback"`
	History             []QuestionFeedback `json:"history"`
	UsedQuestionIDs     []string           `json:"used_question_ids"`
	HintLevel           int                `json:"hint_level"`
	ActiveHint          string             `json:"active_hint"`
	CompletedCount      int                `json:"completed_count"`
	AverageScore        float64            `json:"average_score"`
	Status              Status             `json:"status"`
	SessionSummary      string             `json:"session_summary"`
	NextSteps           []string           `json:"next_steps"`
}

func Defaults() State {
	return State{
		Topics:          []string{},
		History:         []QuestionFeedback{},
		UsedQuestionIDs: []string{},
		NextSteps:       []string{},
		Status:          StatusIdle,
	}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) State {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		maps.Insert(values, source.All())
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Topics == nil {
		state.Topics = []string{}
	}
	if state.History == nil {
		state.History = []QuestionFeedback{}
	}
	if state.UsedQuestionIDs == nil {
		state.UsedQuestionIDs = []string{}
	}
	if state.NextSteps == nil {
		state.NextSteps = []string{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}
