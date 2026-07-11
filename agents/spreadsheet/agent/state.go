package spreadsheet

import (
	"encoding/json"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

const AppName = "spreadsheet_agent"

type Sheet struct {
	Title string     `json:"title"`
	Rows  [][]string `json:"rows"`
}
type SpreadsheetState struct {
	Sheets           []Sheet `json:"sheets"`
	ActiveSheetIndex int     `json:"active_sheet_index"`
	Summary          string  `json:"summary"`
	Status           string  `json:"status"`
	ReviewSummary    string  `json:"review_summary"`
	UserID           string  `json:"user_id"`
}

func Defaults() SpreadsheetState { return SpreadsheetState{Sheets: []Sheet{}, Status: "idle"} }
func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) SpreadsheetState {
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
	if state.Sheets == nil {
		state.Sheets = []Sheet{}
	}
	if state.Status == "" {
		state.Status = "idle"
	}
	if state.ActiveSheetIndex < 0 || state.ActiveSheetIndex >= len(state.Sheets) {
		state.ActiveSheetIndex = 0
	}
	return state
}

func publishState(ctx agent.Context, state SpreadsheetState) {
	s := ctx.State()
	s.Set("sheets", state.Sheets)
	s.Set("active_sheet_index", state.ActiveSheetIndex)
	s.Set("summary", state.Summary)
	s.Set("status", state.Status)
	s.Set("review_summary", state.ReviewSummary)
	s.Set("user_id", state.UserID)
}
