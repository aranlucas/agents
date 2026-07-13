package resume

import (
	"encoding/json"

	"google.golang.org/adk/v2/session"
)

type Status string

const (
	StatusIdle      Status = "idle"
	StatusAnalyzing Status = "analyzing"
	StatusReady     Status = "ready"
)

type ResumeState struct {
	TargetRole      string   `json:"target_role"`
	JobDescription  string   `json:"job_description"`
	FitSummary      string   `json:"fit_summary"`
	Gaps            []string `json:"gaps"`
	TailoredBullets []string `json:"tailored_bullets"`
	Status          Status   `json:"status"`
	ReviewSummary   string   `json:"review_summary"`
}

func Defaults() ResumeState {
	return ResumeState{
		Gaps:            []string{},
		TailoredBullets: []string{},
		Status:          StatusIdle,
	}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) ResumeState {
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
	if state.Gaps == nil {
		state.Gaps = []string{}
	}
	if state.TailoredBullets == nil {
		state.TailoredBullets = []string{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}
