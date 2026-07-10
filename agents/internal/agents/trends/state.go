package trends

import (
	"encoding/json"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

const AppName = "GoogleTrendsAgent"

type Row map[string]any

type TrendsState struct {
	Query        string   `json:"query"`
	GeneratedSQL string   `json:"generated_sql"`
	Columns      []string `json:"columns"`
	Rows         []Row    `json:"rows"`
	Insights     string   `json:"insights"`
	Status       string   `json:"status"`
	Error        string   `json:"error"`
	UserID       string   `json:"user_id"`
}

func Defaults() TrendsState { return TrendsState{Columns: []string{}, Rows: []Row{}, Status: "idle"} }

func StateDefaults() map[string]any {
	raw, _ := json.Marshal(Defaults())
	var result map[string]any
	_ = json.Unmarshal(raw, &result)
	return result
}

type TrendsResult struct {
	Query    string   `json:"query"`
	SQL      string   `json:"sql"`
	Columns  []string `json:"columns"`
	Rows     []Row    `json:"rows"`
	Insights string   `json:"insights"`
	Error    string   `json:"error,omitempty"`
}

type ColumnsRows struct {
	Columns []string `json:"columns"`
	Rows    []Row    `json:"rows"`
}

// Status values mirror the Python port's tools/*.py state machine exactly:
// idle -> querying -> (ready | empty | error).
const (
	StatusIdle     = "idle"
	StatusQuerying = "querying"
	StatusReady    = "ready"
	StatusEmpty    = "empty"
	StatusError    = "error"
)

// Result is the stable success/error envelope every Trends tool returns.
type Result struct {
	OK       bool                          `json:"ok"`
	SQL      string                        `json:"sql,omitempty"`
	Status   string                        `json:"status,omitempty"`
	RowCount int                           `json:"row_count,omitempty"`
	Columns  []string                      `json:"columns,omitempty"`
	Rows     []Row                         `json:"rows,omitempty"`
	Error    *agentruntime.StructuredError `json:"error,omitempty"`
}

func failure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}

func decodeState(tx *agentruntime.Transaction) TrendsState {
	state := Defaults()
	if tx != nil {
		if encoded, err := json.Marshal(tx.Snapshot()); err == nil {
			_ = json.Unmarshal(encoded, &state)
		}
	}
	if state.Columns == nil {
		state.Columns = []string{}
	}
	if state.Rows == nil {
		state.Rows = []Row{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}

func writeState(tx *agentruntime.Transaction, state TrendsState) {
	tx.Set("query", state.Query)
	tx.Set("generated_sql", state.GeneratedSQL)
	tx.Set("columns", state.Columns)
	tx.Set("rows", state.Rows)
	tx.Set("insights", state.Insights)
	tx.Set("status", state.Status)
	tx.Set("error", state.Error)
	tx.Set("user_id", state.UserID)
}

// BeginQueryArgs is begin_trends_query's tool input: the analytical question
// and the validated SQL about to run.
type BeginQueryArgs struct {
	Query string `json:"query"`
	SQL   string `json:"sql"`
}

// BeginTrendsQuery clears any previous result and marks the state
// "querying" before BigQuery execution starts, matching
// tools/begin_trends_query.py.
func BeginTrendsQuery(tx *agentruntime.Transaction, input BeginQueryArgs) (Result, error) {
	state := decodeState(tx)
	state.Query = input.Query
	state.GeneratedSQL = CleanSQL(input.SQL)
	state.Columns, state.Rows, state.Insights, state.Error = []string{}, []Row{}, "", ""
	state.Status = StatusQuerying
	writeState(tx, state)
	return Result{OK: true, Status: state.Status}, nil
}

// WriteResultArgs is write_trends_result's tool input.
type WriteResultArgs struct {
	Query    string   `json:"query"`
	SQL      string   `json:"sql"`
	Columns  []string `json:"columns"`
	Rows     []Row    `json:"rows"`
	Insights string   `json:"insights"`
	Error    string   `json:"error,omitempty"`
}

// WriteTrendsResult persists the final (or failed) query outcome, deriving
// status the same way tools/write_trends_result.py does: an explicit error
// always wins over an empty row set, which in turn wins over "ready".
func WriteTrendsResult(tx *agentruntime.Transaction, input WriteResultArgs) (Result, error) {
	status := StatusReady
	switch {
	case input.Error != "":
		status = StatusError
	case len(input.Rows) == 0:
		status = StatusEmpty
	}
	state := decodeState(tx)
	state.Query = input.Query
	state.GeneratedSQL = CleanSQL(input.SQL)
	state.Columns = input.Columns
	if state.Columns == nil {
		state.Columns = []string{}
	}
	state.Rows = input.Rows
	if state.Rows == nil {
		state.Rows = []Row{}
	}
	state.Insights, state.Error, state.Status = input.Insights, input.Error, status
	writeState(tx, state)
	return Result{OK: input.Error == "", Status: status, RowCount: len(state.Rows)}, nil
}

// VerificationArgs is set_trends_verification's tool input.
type VerificationArgs struct {
	Verification string `json:"verification"`
}

// SetTrendsVerification appends a web-search verification note to insights
// and marks the state ready, matching tools/set_trends_verification.py.
func SetTrendsVerification(tx *agentruntime.Transaction, input VerificationArgs) (Result, error) {
	state := decodeState(tx)
	section := "## Verification\n\n" + input.Verification
	if state.Insights != "" {
		state.Insights = state.Insights + "\n\n" + section
	} else {
		state.Insights = section
	}
	state.Status = StatusReady
	writeState(tx, state)
	return Result{OK: true}, nil
}
