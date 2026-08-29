package research

import (
	"encoding/json"
	"maps"

	"google.golang.org/adk/v2/session"
)

const AppName = "research_canvas_agent"

type Status string

const (
	StatusIdle     Status = "idle"
	StatusDrafting Status = "drafting"
	StatusReady    Status = "ready"
)

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
	Status        Status    `json:"status"`
	ReviewSummary string    `json:"review_summary"`
}

func Defaults() ResearchState {
	return ResearchState{Sections: []Section{}, Sources: []Source{}, Status: StatusIdle}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) ResearchState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		maps.Insert(values, source.All())
	}
	encoded, err := json.Marshal(values)
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
		state.Status = StatusIdle
	}
	return state
}
