package oralboards

import (
	json "encoding/json/v2"
	"maps"

	"google.golang.org/adk/v2/session"
)

const AppName = "oralboards_agent"

type Skill string

type Phase string

const (
	SkillRemember        Skill = "remember"
	SkillUnderstandApply Skill = "understand_apply"
	SkillAnalyzeEvaluate Skill = "analyze_evaluate"

	PhaseIdle        Phase = "idle"
	PhasePresenting  Phase = "presenting"
	PhaseQuestioning Phase = "questioning"
	PhaseFeedback    Phase = "feedback"
	PhaseComplete    Phase = "complete"
)

type CorpusDocumentRef struct {
	DocID      int64  `json:"docid"`
	Filepath   string `json:"filepath"`
	Title      string `json:"title"`
	Collection string `json:"collection"`
}

type Exchange struct {
	Question      string `json:"question"`
	Answer        string `json:"answer"`
	Feedback      string `json:"feedback"`
	IdealResponse string `json:"ideal_response"`
	Skillset      string `json:"skillset"`
	Skill         Skill  `json:"skill"`
	Score         int    `json:"score"`
}

type SkillsetScore struct {
	Skillset  string `json:"skillset"`
	Skill     Skill  `json:"skill"`
	Score     int    `json:"score"`
	Rationale string `json:"rationale"`
}

type State struct {
	Case                  string          `json:"case"`
	CasePassages          string          `json:"case_passages"`
	Transcript            []Exchange      `json:"transcript"`
	ScoreCard             string          `json:"score_card"`
	ScoreSummary          []SkillsetScore `json:"score_summary"`
	Outcome               string          `json:"outcome"`
	Status                Phase           `json:"status"`
	LoadingStep           string          `json:"loading_step"`
	CurrentQuestion       string          `json:"current_question"`
	InterviewComplete     bool            `json:"interview_complete"`
	ActiveFeedback        string          `json:"active_feedback"`
	ActiveIdealResponse   string          `json:"active_ideal_response"`
	ActiveProbe           string          `json:"active_probe"`
	ProbeUsed             bool            `json:"_probe_used"`
	QuestionCraftFeedback string          `json:"question_craft_feedback"`
	SearchCalls           int             `json:"_search_docs_calls"`
}

func Defaults() State {
	return State{Transcript: []Exchange{}, ScoreSummary: []SkillsetScore{}, Status: PhaseIdle}
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
		maps.Insert(values, source.All())
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Transcript == nil {
		state.Transcript = []Exchange{}
	}
	if state.ScoreSummary == nil {
		state.ScoreSummary = []SkillsetScore{}
	}
	if state.Status == "" {
		state.Status = PhaseIdle
	}
	return state
}
