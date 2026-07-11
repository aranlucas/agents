package spreadsheet

import (
	"encoding/json"
	"testing"
)

func TestSetActiveSheetRejectsOutOfRangeWithoutMutation(t *testing.T) {
	state := newSpreadsheetState(Sheet{Title: "Budget", Rows: [][]string{}})
	before := jsonText(state)
	result, err := setActiveSheet(&state, SheetIndexArgs{SheetIndex: 2})
	if err != nil || result.OK || result.Error.Code != "sheet_index_out_of_range" {
		t.Fatalf("result=%#v,error=%v", result, err)
	}
	if jsonText(state) != before || state.ActiveSheetIndex != 0 {
		t.Fatal("invalid index mutated state")
	}
}

func TestAppendRowsPreservesOrderAndBounds(t *testing.T) {
	state := newSpreadsheetState(Sheet{Title: "Data", Rows: [][]string{{"H"}}})
	result, _ := appendRows(&state, AppendRowsArgs{SheetIndex: 0, Rows: [][]string{{"R1"}, {"R2"}}})
	rows := state.Sheets[0].Rows
	if !result.OK || result.TotalRows != 3 || rows[1][0] != "R1" || rows[2][0] != "R2" {
		t.Fatalf("result/rows=%#v/%#v", result, rows)
	}
	tooMany := make([][]string, maxRowsPerSheet+1)
	before := jsonText(state)
	result, _ = appendRows(&state, AppendRowsArgs{SheetIndex: 0, Rows: tooMany})
	if result.OK || result.Error.Code != "row_limit_reached" || jsonText(state) != before {
		t.Fatalf("bounded result=%#v", result)
	}
}

func TestDeleteClampsActiveIndex(t *testing.T) {
	state := newSpreadsheetState(Sheet{Title: "A"}, Sheet{Title: "B"})
	_, _ = setActiveSheet(&state, SheetIndexArgs{SheetIndex: 1})
	result, _ := deleteSheet(&state, SheetIndexArgs{SheetIndex: 1})
	if !result.OK || len(state.Sheets) != 1 || state.ActiveSheetIndex != 0 {
		t.Fatalf("result/state=%#v/%#v", result, state)
	}
}

func TestCreateUpdateAndSummary(t *testing.T) {
	state := Defaults()
	created, _ := createSheet(&state, CreateSheetArgs{Title: "Sheet", Rows: [][]string{{"A"}, {"1"}}})
	if !created.OK || created.SheetIndex == nil || *created.SheetIndex != 0 {
		t.Fatalf("created=%#v", created)
	}
	updated, _ := updateSheet(&state, UpdateSheetArgs{SheetIndex: 0, Title: "Renamed", Rows: [][]string{{"B"}}})
	summary, _ := writeSummary(&state, SummaryArgs{Summary: "Complete"})
	if !updated.OK || !summary.OK || state.Sheets[0].Title != "Renamed" || state.Summary != "Complete" || state.Status != "ready" {
		t.Fatalf("state=%#v", state)
	}
}

func newSpreadsheetState(sheets ...Sheet) SpreadsheetState {
	state := Defaults()
	state.Sheets = sheets
	return state
}
func jsonText(value any) string { data, _ := json.Marshal(value); return string(data) }
