package spreadsheet

import (
	"context"
	"encoding/json"
	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"testing"
)

func TestSetActiveSheetRejectsOutOfRangeWithoutMutation(t *testing.T) {
	tx := newSpreadsheetTx(Sheet{Title: "Budget", Rows: [][]string{}})
	before := jsonText(tx.Snapshot())
	result, err := SetActiveSheet(context.Background(), tx, SheetIndexArgs{SheetIndex: 2})
	if err != nil || result.OK || result.Error.Code != "sheet_index_out_of_range" {
		t.Fatalf("result=%#v,error=%v", result, err)
	}
	if jsonText(tx.Snapshot()) != before || decodeState(tx).ActiveSheetIndex != 0 {
		t.Fatal("invalid index mutated state")
	}
}
func TestAppendRowsPreservesOrderAndBounds(t *testing.T) {
	tx := newSpreadsheetTx(Sheet{Title: "Data", Rows: [][]string{{"H"}}})
	result, _ := AppendRows(context.Background(), tx, AppendRowsArgs{SheetIndex: 0, Rows: [][]string{{"R1"}, {"R2"}}})
	rows := decodeState(tx).Sheets[0].Rows
	if !result.OK || result.TotalRows != 3 || rows[1][0] != "R1" || rows[2][0] != "R2" {
		t.Fatalf("result/rows=%#v/%#v", result, rows)
	}
	tooMany := make([][]string, maxRowsPerSheet+1)
	before := jsonText(tx.Snapshot())
	result, _ = AppendRows(context.Background(), tx, AppendRowsArgs{SheetIndex: 0, Rows: tooMany})
	if result.OK || result.Error.Code != "row_limit_reached" || jsonText(tx.Snapshot()) != before {
		t.Fatalf("bounded result=%#v", result)
	}
}
func TestDeleteClampsActiveIndex(t *testing.T) {
	tx := newSpreadsheetTx(Sheet{Title: "A"}, Sheet{Title: "B"})
	_, _ = SetActiveSheet(context.Background(), tx, SheetIndexArgs{SheetIndex: 1})
	result, _ := DeleteSheet(context.Background(), tx, SheetIndexArgs{SheetIndex: 1})
	state := decodeState(tx)
	if !result.OK || len(state.Sheets) != 1 || state.ActiveSheetIndex != 0 {
		t.Fatalf("result/state=%#v/%#v", result, state)
	}
}
func TestCreateUpdateAndSummary(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	created, _ := CreateSheet(context.Background(), tx, CreateSheetArgs{Title: "Sheet", Rows: [][]string{{"A"}, {"1"}}})
	if !created.OK || created.SheetIndex == nil || *created.SheetIndex != 0 {
		t.Fatalf("created=%#v", created)
	}
	updated, _ := UpdateSheet(context.Background(), tx, UpdateSheetArgs{SheetIndex: 0, Title: "Renamed", Rows: [][]string{{"B"}}})
	summary, _ := WriteSummary(context.Background(), tx, SummaryArgs{Summary: "Complete"})
	state := decodeState(tx)
	if !updated.OK || !summary.OK || state.Sheets[0].Title != "Renamed" || state.Summary != "Complete" || state.Status != "ready" {
		t.Fatalf("state=%#v", state)
	}
}
func newSpreadsheetTx(sheets ...Sheet) *agentruntime.Transaction {
	state := StateDefaults()
	state["sheets"] = sheets
	return agentruntime.NewTransaction(state)
}
func jsonText(value any) string { data, _ := json.Marshal(value); return string(data) }
