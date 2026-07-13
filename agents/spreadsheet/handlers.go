package spreadsheet

import (
	"fmt"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

const (
	maxSheets        = 50
	maxRowsPerSheet  = 10_000
	maxColumns       = 200
	maxCellsPerSheet = 100_000
	maxSheetBytes    = 2 << 20
)

type Result struct {
	OK               bool                          `json:"ok"`
	SheetIndex       *int                          `json:"sheet_index,omitempty"`
	ActiveSheetIndex *int                          `json:"active_sheet_index,omitempty"`
	TotalRows        int                           `json:"total_rows,omitempty"`
	RemainingSheets  int                           `json:"remaining_sheets,omitempty"`
	Length           int                           `json:"length,omitempty"`
	Error            *agentruntime.StructuredError `json:"error,omitempty"`
}
type CreateSheetArgs struct {
	Title string     `json:"title"`
	Rows  [][]string `json:"rows"`
}
type UpdateSheetArgs struct {
	SheetIndex int        `json:"sheet_index"`
	Title      string     `json:"title"`
	Rows       [][]string `json:"rows"`
}
type AppendRowsArgs struct {
	SheetIndex int        `json:"sheet_index"`
	Rows       [][]string `json:"rows"`
}
type SheetIndexArgs struct {
	SheetIndex int `json:"sheet_index"`
}
type SummaryArgs struct {
	Summary string `json:"summary"`
}

func CreateSheet(ctx agent.Context, input CreateSheetArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := createSheet(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("sheets", state.Sheets); err != nil {
			return Result{}, fmt.Errorf("set sheets: %w", err)
		}
		if err := ctx.State().Set("active_sheet_index", state.ActiveSheetIndex); err != nil {
			return Result{}, fmt.Errorf("set active_sheet_index: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func createSheet(state *SpreadsheetState, input CreateSheetArgs) (Result, error) {
	if len(state.Sheets) >= maxSheets {
		return fail("sheet_limit_reached", "workbook cannot exceed 50 sheets"), nil
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || len(title) > 200 {
		return fail("invalid_sheet_title", "sheet title is required and must be at most 200 characters"), nil
	}
	if code, message := validateRows(input.Rows); code != "" {
		return fail(code, message), nil
	}
	index := len(state.Sheets)
	state.Sheets = append(state.Sheets, Sheet{Title: title, Rows: input.Rows})
	state.ActiveSheetIndex = index
	state.Status = StatusReady
	return Result{OK: true, SheetIndex: &index}, nil
}

func UpdateSheet(ctx agent.Context, input UpdateSheetArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := updateSheet(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("sheets", state.Sheets); err != nil {
			return Result{}, fmt.Errorf("set sheets: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func updateSheet(state *SpreadsheetState, input UpdateSheetArgs) (Result, error) {
	if !validIndex(state, input.SheetIndex) {
		return fail("sheet_index_out_of_range", "sheet index is out of range"), nil
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || len(title) > 200 {
		return fail("invalid_sheet_title", "sheet title is required and must be at most 200 characters"), nil
	}
	if code, message := validateRows(input.Rows); code != "" {
		return fail(code, message), nil
	}
	state.Sheets[input.SheetIndex] = Sheet{Title: title, Rows: input.Rows}
	state.Status = StatusReady
	index := input.SheetIndex
	return Result{OK: true, SheetIndex: &index}, nil
}

func AppendRows(ctx agent.Context, input AppendRowsArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := appendRows(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("sheets", state.Sheets); err != nil {
			return Result{}, fmt.Errorf("set sheets: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func appendRows(state *SpreadsheetState, input AppendRowsArgs) (Result, error) {
	if !validIndex(state, input.SheetIndex) {
		return fail("sheet_index_out_of_range", "sheet index is out of range"), nil
	}
	combined := make([][]string, 0, len(state.Sheets[input.SheetIndex].Rows)+len(input.Rows))
	combined = append(combined, state.Sheets[input.SheetIndex].Rows...)
	combined = append(combined, input.Rows...)
	if code, message := validateRows(combined); code != "" {
		return fail(code, message), nil
	}
	state.Sheets[input.SheetIndex].Rows = combined
	state.Status = StatusReady
	index := input.SheetIndex
	return Result{OK: true, SheetIndex: &index, TotalRows: len(combined)}, nil
}

func DeleteSheet(ctx agent.Context, input SheetIndexArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := deleteSheet(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("sheets", state.Sheets); err != nil {
			return Result{}, fmt.Errorf("set sheets: %w", err)
		}
		if err := ctx.State().Set("active_sheet_index", state.ActiveSheetIndex); err != nil {
			return Result{}, fmt.Errorf("set active_sheet_index: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func deleteSheet(state *SpreadsheetState, input SheetIndexArgs) (Result, error) {
	if !validIndex(state, input.SheetIndex) {
		return fail("sheet_index_out_of_range", "sheet index is out of range"), nil
	}
	state.Sheets = append(state.Sheets[:input.SheetIndex:input.SheetIndex], state.Sheets[input.SheetIndex+1:]...)
	switch {
	case len(state.Sheets) == 0:
		state.ActiveSheetIndex = 0
	case state.ActiveSheetIndex >= len(state.Sheets):
		state.ActiveSheetIndex = len(state.Sheets) - 1
	case state.ActiveSheetIndex == input.SheetIndex && input.SheetIndex > 0:
		state.ActiveSheetIndex = input.SheetIndex - 1
	}
	state.Status = StatusReady
	return Result{OK: true, RemainingSheets: len(state.Sheets)}, nil
}

func SetActiveSheet(ctx agent.Context, input SheetIndexArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := setActiveSheet(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("active_sheet_index", state.ActiveSheetIndex); err != nil {
			return Result{}, fmt.Errorf("set active_sheet_index: %w", err)
		}
	}
	return r, e
}

func setActiveSheet(state *SpreadsheetState, input SheetIndexArgs) (Result, error) {
	if !validIndex(state, input.SheetIndex) {
		return fail("sheet_index_out_of_range", "sheet index is out of range"), nil
	}
	state.ActiveSheetIndex = input.SheetIndex
	index := input.SheetIndex
	return Result{OK: true, ActiveSheetIndex: &index}, nil
}

func WriteSummary(ctx agent.Context, input SummaryArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := writeSummary(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("summary", state.Summary); err != nil {
			return Result{}, fmt.Errorf("set summary: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func writeSummary(state *SpreadsheetState, input SummaryArgs) (Result, error) {
	if len(input.Summary) > 1<<20 {
		return fail("summary_too_large", "summary exceeds the 1 MiB state limit"), nil
	}
	state.Summary = input.Summary
	state.Status = StatusReady
	return Result{OK: true, Length: len(input.Summary)}, nil
}

func validIndex(state *SpreadsheetState, index int) bool {
	return index >= 0 && index < len(state.Sheets)
}

func validateRows(rows [][]string) (string, string) {
	if len(rows) > maxRowsPerSheet {
		return "row_limit_reached", "sheet cannot exceed 10000 rows"
	}
	cells, totalBytes := 0, 0
	for _, row := range rows {
		if len(row) > maxColumns {
			return "column_limit_reached", "sheet cannot exceed 200 columns"
		}
		cells += len(row)
		for _, cell := range row {
			if len(cell) > 10_000 {
				return "cell_too_large", "cell exceeds 10000 characters"
			}
			totalBytes += len(cell)
		}
	}
	if cells > maxCellsPerSheet {
		return "cell_limit_reached", "sheet cannot exceed 100000 cells"
	}
	if totalBytes > maxSheetBytes {
		return "sheet_too_large", "sheet cell content exceeds 2 MiB"
	}
	return "", ""
}

func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
