package spreadsheet

import (
	"github.com/aranlucas/agents/internal/agentruntime"

	"google.golang.org/adk/v2/session"
)

const AppName = "spreadsheet_agent"

type Status string

const (
	StatusIdle  Status = "idle"
	StatusReady Status = "ready"
)

type Sheet struct {
	Title string     `json:"title"`
	Rows  [][]string `json:"rows"`
}
type SpreadsheetState struct {
	Sheets           []Sheet `json:"sheets"`
	ActiveSheetIndex int     `json:"active_sheet_index"`
	Summary          string  `json:"summary"`
	Status           Status  `json:"status"`
	ReviewSummary    string  `json:"review_summary"`
}

func Defaults() SpreadsheetState { return SpreadsheetState{Sheets: []Sheet{}, Status: StatusIdle} }
func StateDefaults() map[string]any {
	return agentruntime.StateMap(Defaults())
}

func readState(source session.ReadonlyState) SpreadsheetState {
	state := agentruntime.ReadState(source, Defaults())
	if state.Sheets == nil {
		state.Sheets = []Sheet{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	if state.ActiveSheetIndex < 0 || state.ActiveSheetIndex >= len(state.Sheets) {
		state.ActiveSheetIndex = 0
	}
	return state
}
