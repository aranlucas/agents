package presentation

import (
	"encoding/json"

	"google.golang.org/adk/v2/session"
)

const AppName = "presentation_agent"

type Status string

const (
	StatusIdle     Status = "idle"
	StatusDrafting Status = "drafting"
	StatusReady    Status = "ready"
)

type Slide struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Heading string `json:"heading"`
	Body    string `json:"body"`
	Notes   string `json:"notes"`
}

type PresentationState struct {
	Title            string  `json:"title"`
	Theme            string  `json:"theme"`
	Slides           []Slide `json:"slides"`
	ActiveSlideIndex int     `json:"active_slide_index"`
	Status           Status  `json:"status"`
	ReviewSummary    string  `json:"review_summary"`
}

func Defaults() PresentationState {
	return PresentationState{Theme: "light", Slides: []Slide{}, Status: StatusIdle}
}

func StateDefaults() map[string]any {
	state := Defaults()
	encoded, _ := json.Marshal(state)
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) PresentationState {
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
	if state.Theme == "" {
		state.Theme = "light"
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	if state.Slides == nil {
		state.Slides = []Slide{}
	}
	if state.ActiveSlideIndex < 0 || state.ActiveSlideIndex >= len(state.Slides) {
		state.ActiveSlideIndex = 0
	}
	return state
}
