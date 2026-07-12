package oralboards

import (
	"encoding/json"
	"fmt"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

const AppName = "oralboards_agent"

type Skill string

const (
	SkillRemember        Skill = "remember"
	SkillUnderstandApply Skill = "understand_apply"
	SkillAnalyzeEvaluate Skill = "analyze_evaluate"
)

type CaseSource struct {
	DocID      int64  `json:"docid"`
	Filepath   string `json:"filepath"`
	Title      string `json:"title"`
	Collection string `json:"collection"`
}

type Exchange struct {
	Question      string       `json:"question"`
	Answer        string       `json:"answer"`
	Feedback      string       `json:"feedback"`
	IdealResponse string       `json:"ideal_response"`
	Skillset      string       `json:"skillset"`
	Skill         Skill        `json:"skill"`
	Score         int          `json:"score"`
	Citations     []CaseSource `json:"citations"`
}

type SkillsetScore struct {
	Skillset  string `json:"skillset"`
	Skill     Skill  `json:"skill"`
	Score     int    `json:"score"`
	Rationale string `json:"rationale"`
}

type State struct {
	Case                  string          `json:"case"`
	CaseSources           []CaseSource    `json:"case_sources"`
	CasePassages          string          `json:"case_passages"`
	Transcript            []Exchange      `json:"transcript"`
	ScoreCard             string          `json:"score_card"`
	ScoreSummary          []SkillsetScore `json:"score_summary"`
	Outcome               string          `json:"outcome"`
	Status                string          `json:"status"`
	LoadingStep           string          `json:"loading_step"`
	CurrentQuestion       string          `json:"current_question"`
	InterviewComplete     bool            `json:"interview_complete"`
	ActiveFeedback        string          `json:"active_feedback"`
	ActiveIdealResponse   string          `json:"active_ideal_response"`
	ActiveProbe           string          `json:"active_probe"`
	QuestionCraftFeedback string          `json:"question_craft_feedback"`
	SearchCalls           int             `json:"_search_docs_calls"`
	UserID                string          `json:"user_id"`
}

func Defaults() State {
	return State{CaseSources: []CaseSource{}, Transcript: []Exchange{}, ScoreSummary: []SkillsetScore{}, Status: "idle"}
}

func StateDefaults() map[string]any {
	raw, _ := json.Marshal(Defaults())
	var result map[string]any
	_ = json.Unmarshal(raw, &result)
	return result
}

func readState(source session.ReadonlyState) State {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		for key, value := range source.All() {
			values[key] = value
		}
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.CaseSources == nil {
		state.CaseSources = []CaseSource{}
	}
	if state.Transcript == nil {
		state.Transcript = []Exchange{}
	}
	if state.ScoreSummary == nil {
		state.ScoreSummary = []SkillsetScore{}
	}
	return state
}

func publishState(ctx agent.Context, state State) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"case", state.Case},
		{"case_sources", state.CaseSources},
		{"case_passages", state.CasePassages},
		{"transcript", state.Transcript},
		{"score_card", state.ScoreCard},
		{"score_summary", state.ScoreSummary},
		{"outcome", state.Outcome},
		{"status", state.Status},
		{"loading_step", state.LoadingStep},
		{"current_question", state.CurrentQuestion},
		{"interview_complete", state.InterviewComplete},
		{"active_feedback", state.ActiveFeedback},
		{"active_ideal_response", state.ActiveIdealResponse},
		{"active_probe", state.ActiveProbe},
		{"question_craft_feedback", state.QuestionCraftFeedback},
		{"_search_docs_calls", state.SearchCalls},
		{"user_id", state.UserID},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}
