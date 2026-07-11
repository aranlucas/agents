package research

import (
	"encoding/json"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
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

func readState(source session.ReadonlyState) ResearchState {
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

func publishState(ctx agent.Context, state ResearchState) {
	s := ctx.State()
	s.Set("title", state.Title)
	s.Set("query", state.Query)
	s.Set("report", state.Report)
	s.Set("sections", state.Sections)
	s.Set("sources", state.Sources)
	s.Set("status", state.Status)
	s.Set("review_summary", state.ReviewSummary)
	s.Set("user_id", state.UserID)
}
