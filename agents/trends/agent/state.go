package trends

import (
	"encoding/json"
	"fmt"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
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

type Status string

type TrendsState struct {
	Query        string   `json:"query"`
	GeneratedSQL string   `json:"generated_sql"`
	Columns      []string `json:"columns"`
	Rows         []Row    `json:"rows"`
	Insights     string   `json:"insights"`
	Status       Status   `json:"status"`
	Error        string   `json:"error"`
	UserID       string   `json:"user_id"`
}

func Defaults() TrendsState {
	return TrendsState{Columns: []string{}, Rows: []Row{}, Status: StatusIdle}
}

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
	StatusIdle     Status = "idle"
	StatusQuerying Status = "querying"
	StatusReady    Status = "ready"
	StatusEmpty    Status = "empty"
	StatusError    Status = "error"
)

// Result is the stable success/error envelope every Trends tool returns.
type Result struct {
	OK       bool                          `json:"ok"`
	SQL      string                        `json:"sql,omitempty"`
	Status   Status                        `json:"status,omitempty"`
	RowCount int                           `json:"row_count,omitempty"`
	Columns  []string                      `json:"columns,omitempty"`
	Rows     []Row                         `json:"rows,omitempty"`
	Error    *agentruntime.StructuredError `json:"error,omitempty"`
}

func failure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}

func readState(source session.ReadonlyState) TrendsState {
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

func publishState(ctx agent.Context, state TrendsState) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"query", state.Query},
		{"generated_sql", state.GeneratedSQL},
		{"columns", state.Columns},
		{"rows", state.Rows},
		{"insights", state.Insights},
		{"status", state.Status},
		{"error", state.Error},
		{"user_id", state.UserID},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}

// BeginQueryArgs is begin_trends_query's tool input: the analytical question
// and the validated SQL about to run.
type BeginQueryArgs struct {
	Query string `json:"query"`
	SQL   string `json:"sql"`
}

// BeginTrendsQuery is the ADK-facing tool handler for begin_trends_query. It
// always publishes state on success (not gated on result.OK): a rejected
// call never touches state, so publishing the unchanged read-back is a
// no-op, matching the unconditional-commit behavior this replaces.
func BeginTrendsQuery(ctx agent.Context, input BeginQueryArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := beginTrendsQuery(&state, input)
	if err != nil {
		return Result{}, err
	}
	if pubErr := publishState(ctx, state); pubErr != nil {
		return Result{}, pubErr
	}
	return result, nil
}

// beginTrendsQuery clears any previous result and marks the state
// "querying" before BigQuery execution starts, matching
// tools/begin_trends_query.py. Inputs are validated before any state
// mutation: a rejected call leaves the prior state entirely untouched.
func beginTrendsQuery(state *TrendsState, input BeginQueryArgs) (Result, error) {
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
	state.Query = query
	state.GeneratedSQL = cleaned
	state.Columns, state.Rows, state.Insights, state.Error = []string{}, []Row{}, "", ""
	state.Status = StatusQuerying
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

// WriteTrendsResult is the ADK-facing tool handler for write_trends_result.
// It always publishes state on success (not gated on result.OK): recording
// a query failure is itself a legitimate, accepted mutation (result.OK is
// false but state.Error/state.Status must still persist), so gating on OK
// would silently drop that write.
func WriteTrendsResult(ctx agent.Context, input WriteResultArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := writeTrendsResult(&state, input)
	if err != nil {
		return Result{}, err
	}
	if pubErr := publishState(ctx, state); pubErr != nil {
		return Result{}, pubErr
	}
	return result, nil
}

// writeTrendsResult persists the final (or failed) query outcome, deriving
// status the same way tools/write_trends_result.py does: an explicit error
// always wins over an empty row set, which in turn wins over "ready".
// Inputs are validated before any state mutation: a rejected call leaves the
// prior state entirely untouched.
func writeTrendsResult(state *TrendsState, input WriteResultArgs) (Result, error) {
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
	return Result{OK: input.Error == "", Status: status, RowCount: len(state.Rows)}, nil
}

// VerificationArgs is set_trends_verification's tool input.
type VerificationArgs struct {
	Verification string `json:"verification"`
}

// SetTrendsVerification is the ADK-facing tool handler for
// set_trends_verification. It always publishes state on success (not gated
// on result.OK), matching BeginTrendsQuery and WriteTrendsResult above.
func SetTrendsVerification(ctx agent.Context, input VerificationArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setTrendsVerification(&state, input)
	if err != nil {
		return Result{}, err
	}
	if pubErr := publishState(ctx, state); pubErr != nil {
		return Result{}, pubErr
	}
	return result, nil
}

// setTrendsVerification appends a web-search verification note to insights
// and marks the state ready, matching tools/set_trends_verification.py.
// Inputs are validated before any state mutation: a rejected call leaves the
// prior state entirely untouched.
func setTrendsVerification(state *TrendsState, input VerificationArgs) (Result, error) {
	verification := strings.TrimSpace(input.Verification)
	if verification == "" || len(verification) > maxTrendsVerificationLength {
		return failure("verification_required", fmt.Sprintf("verification is required and must be at most %d characters", maxTrendsVerificationLength)), nil
	}
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
	return Result{OK: true}, nil
}
