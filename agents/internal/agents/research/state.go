package research

import (
	"encoding/json"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

const AppName = "research_canvas_agent"

type Section struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
}
type Source struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}
type ResearchState struct {
	Title         string    `json:"title"`
	Query         string    `json:"query"`
	Report        string    `json:"report"`
	Sections      []Section `json:"sections"`
	Sources       []Source  `json:"sources"`
	Status        string    `json:"status"`
	ReviewSummary string    `json:"review_summary"`
	UserID        string    `json:"user_id"`
}

func Defaults() ResearchState {
	return ResearchState{Sections: []Section{}, Sources: []Source{}, Status: "idle"}
}
func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}
func decodeState(tx *agentruntime.Transaction) ResearchState {
	state := Defaults()
	if tx == nil {
		return state
	}
	encoded, err := json.Marshal(tx.Snapshot())
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Sections == nil {
		state.Sections = []Section{}
	}
	if state.Sources == nil {
		state.Sources = []Source{}
	}
	if state.Status == "" {
		state.Status = "idle"
	}
	return state
}
func writeState(tx *agentruntime.Transaction, state ResearchState) {
	tx.Set("title", state.Title)
	tx.Set("query", state.Query)
	tx.Set("report", state.Report)
	tx.Set("sections", state.Sections)
	tx.Set("sources", state.Sources)
	tx.Set("status", state.Status)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
}
