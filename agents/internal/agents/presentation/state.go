package presentation

import (
	"encoding/json"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

const AppName = "presentation_agent"

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
	Status           string  `json:"status"`
	ReviewSummary    string  `json:"review_summary"`
	UserID           string  `json:"user_id"`
}

func Defaults() PresentationState {
	return PresentationState{Theme: "light", Slides: []Slide{}, Status: "idle"}
}

func StateDefaults() map[string]any {
	state := Defaults()
	encoded, _ := json.Marshal(state)
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func decodeState(tx *agentruntime.Transaction) PresentationState {
	state := Defaults()
	if tx == nil {
		return state
	}
	encoded, err := json.Marshal(tx.Snapshot())
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Theme == "" {
		state.Theme = "light"
	}
	if state.Status == "" {
		state.Status = "idle"
	}
	if state.Slides == nil {
		state.Slides = []Slide{}
	}
	if state.ActiveSlideIndex < 0 || state.ActiveSlideIndex >= len(state.Slides) {
		state.ActiveSlideIndex = 0
	}
	return state
}

func writeState(tx *agentruntime.Transaction, state PresentationState) {
	tx.Set("title", state.Title)
	tx.Set("theme", state.Theme)
	tx.Set("slides", state.Slides)
	tx.Set("active_slide_index", state.ActiveSlideIndex)
	tx.Set("status", state.Status)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
}
