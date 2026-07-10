package spreadsheet

import (
	"encoding/json"
	"github.com/aranlucas/agents/agents/internal/agentruntime"
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
func decodeState(tx *agentruntime.Transaction) SpreadsheetState {
	state := Defaults()
	if tx == nil {
		return state
	}
	encoded, err := json.Marshal(tx.Snapshot())
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
func writeState(tx *agentruntime.Transaction, state SpreadsheetState) {
	tx.Set("sheets", state.Sheets)
	tx.Set("active_sheet_index", state.ActiveSheetIndex)
	tx.Set("summary", state.Summary)
	tx.Set("status", state.Status)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
}
