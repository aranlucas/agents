package trends

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

// Size caps for trends state mutation inputs. Row/column bounds mirror
// bigquery.go's defaultRowLimit so a tool can never persist more data than
// BigQuery itself is allowed to return.
const (
	maxTrendsQueryLength        = 2_000
	maxTrendsSQLLength          = 10_000
	maxTrendsInsightsLength     = 20_000
	maxTrendsErrorLength        = 10_000
	maxTrendsVerificationLength = 10_000
	maxTrendsColumns            = defaultRowLimit
	maxTrendsColumnNameLength   = 200
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
// tools/begin_trends_query.py. Inputs are validated before any state
// mutation: a rejected call leaves the prior state entirely untouched.
func BeginTrendsQuery(tx *agentruntime.Transaction, input BeginQueryArgs) (Result, error) {
	query := strings.TrimSpace(input.Query)
	if query == "" || len(query) > maxTrendsQueryLength {
		return failure("query_required", fmt.Sprintf("query is required and must be at most %d characters", maxTrendsQueryLength)), nil
	}
	cleaned := CleanSQL(input.SQL)
	if cleaned == "" || len(cleaned) > maxTrendsSQLLength {
		return failure("sql_required", fmt.Sprintf("sql is required and must be at most %d characters", maxTrendsSQLLength)), nil
	}
	if err := ValidateSQL(cleaned); err != nil {
		return failure("unsafe_sql", "sql must be a bounded, read-only SELECT/WITH query"), nil
	}
	state := decodeState(tx)
	state.Query = query
	state.GeneratedSQL = cleaned
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
// Inputs are validated before any state mutation: a rejected call leaves the
// prior state entirely untouched.
func WriteTrendsResult(tx *agentruntime.Transaction, input WriteResultArgs) (Result, error) {
	query := strings.TrimSpace(input.Query)
	if query == "" || len(query) > maxTrendsQueryLength {
		return failure("query_required", fmt.Sprintf("query is required and must be at most %d characters", maxTrendsQueryLength)), nil
	}
	cleaned := CleanSQL(input.SQL)
	if cleaned == "" || len(cleaned) > maxTrendsSQLLength {
		return failure("sql_required", fmt.Sprintf("sql is required and must be at most %d characters", maxTrendsSQLLength)), nil
	}
	if err := ValidateSQL(cleaned); err != nil {
		return failure("unsafe_sql", "sql must be a bounded, read-only SELECT/WITH query"), nil
	}
	if len(input.Columns) > maxTrendsColumns {
		return failure("too_many_columns", fmt.Sprintf("result cannot exceed %d columns", maxTrendsColumns)), nil
	}
	for _, column := range input.Columns {
		if len(column) > maxTrendsColumnNameLength {
			return failure("column_name_too_large", fmt.Sprintf("a column name exceeds %d characters", maxTrendsColumnNameLength)), nil
		}
	}
	if len(input.Rows) > defaultRowLimit {
		return failure("too_many_rows", fmt.Sprintf("result cannot exceed %d rows", defaultRowLimit)), nil
	}
	if len(input.Insights) > maxTrendsInsightsLength {
		return failure("insights_too_large", fmt.Sprintf("insights exceed %d characters", maxTrendsInsightsLength)), nil
	}
	if len(input.Error) > maxTrendsErrorLength {
		return failure("error_too_large", fmt.Sprintf("error message exceeds %d characters", maxTrendsErrorLength)), nil
	}
	status := StatusReady
	switch {
	case input.Error != "":
		status = StatusError
	case len(input.Rows) == 0:
		status = StatusEmpty
	}
	state := decodeState(tx)
	state.Query = query
	state.GeneratedSQL = cleaned
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
// Inputs are validated before any state mutation: a rejected call leaves the
// prior state entirely untouched.
func SetTrendsVerification(tx *agentruntime.Transaction, input VerificationArgs) (Result, error) {
	verification := strings.TrimSpace(input.Verification)
	if verification == "" || len(verification) > maxTrendsVerificationLength {
		return failure("verification_required", fmt.Sprintf("verification is required and must be at most %d characters", maxTrendsVerificationLength)), nil
	}
	state := decodeState(tx)
	section := "## Verification\n\n" + verification
	appended := section
	if state.Insights != "" {
		appended = state.Insights + "\n\n" + section
	}
	if len(appended) > maxTrendsInsightsLength {
		return failure("insights_too_large", fmt.Sprintf("insights exceed %d characters after appending verification", maxTrendsInsightsLength)), nil
	}
	state.Insights = appended
	state.Status = StatusReady
	writeState(tx, state)
	return Result{OK: true}, nil
}
