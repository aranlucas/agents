package trends

import (
	"strings"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestBeginTrendsQueryRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := map[string]any{"query": "prior", "generated_sql": "SELECT 1 LIMIT 10", "status": StatusReady}

	cases := []struct {
		name string
		args BeginQueryArgs
		code string
	}{
		{"missing query", BeginQueryArgs{Query: "", SQL: "SELECT 1 LIMIT 10"}, "query_required"},
		{"query too large", BeginQueryArgs{Query: strings.Repeat("q", maxTrendsQueryLength+1), SQL: "SELECT 1 LIMIT 10"}, "query_required"},
		{"missing sql", BeginQueryArgs{Query: "top terms", SQL: ""}, "sql_required"},
		{"sql too large", BeginQueryArgs{Query: "top terms", SQL: "SELECT 1 LIMIT 10 -- " + strings.Repeat("x", maxTrendsSQLLength)}, "sql_required"},
		{"unsafe sql", BeginQueryArgs{Query: "top terms", SQL: "DELETE FROM x"}, "unsafe_sql"},
		{"unbounded sql", BeginQueryArgs{Query: "top terms", SQL: "SELECT * FROM x"}, "unsafe_sql"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx := agentruntime.NewTransaction(cloneSeed(seed))
			result, err := BeginTrendsQuery(tx, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			state := decodeState(tx)
			if state.Query != "prior" || state.GeneratedSQL != "SELECT 1 LIMIT 10" || state.Status != StatusReady {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestBeginTrendsQueryClearsPriorResultAndMarksQuerying(t *testing.T) {
	tx := agentruntime.NewTransaction(map[string]any{
		"columns": []string{"stale"}, "rows": []Row{{"stale": true}}, "insights": "stale", "error": "stale",
	})
	result, err := BeginTrendsQuery(tx, BeginQueryArgs{Query: "top terms", SQL: "```sql\nSELECT 1 LIMIT 10\n```"})
	if err != nil || !result.OK || result.Status != StatusQuerying {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
	state := decodeState(tx)
	if state.Query != "top terms" || state.GeneratedSQL != "SELECT 1 LIMIT 10" || state.Status != StatusQuerying {
		t.Fatalf("state = %#v", state)
	}
	if len(state.Columns) != 0 || len(state.Rows) != 0 || state.Insights != "" || state.Error != "" {
		t.Fatalf("prior result not cleared: %#v", state)
	}
}

func TestWriteTrendsResultDistinguishesReadyEmptyAndError(t *testing.T) {
	ready, err := WriteTrendsResult(agentruntime.NewTransaction(nil), WriteResultArgs{
		Query: "q", SQL: "SELECT 1 LIMIT 10", Columns: []string{"term"}, Rows: []Row{{"term": "python"}}, Insights: "Python leads.",
	})
	if err != nil || !ready.OK || ready.Status != StatusReady || ready.RowCount != 1 {
		t.Fatalf("ready result = %#v, err = %v", ready, err)
	}

	empty, err := WriteTrendsResult(agentruntime.NewTransaction(nil), WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Insights: "No matches."})
	if err != nil || !empty.OK || empty.Status != StatusEmpty || empty.RowCount != 0 {
		t.Fatalf("empty result = %#v, err = %v", empty, err)
	}

	failedTx := agentruntime.NewTransaction(nil)
	failed, err := WriteTrendsResult(failedTx, WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Error: "BigQuery query failed."})
	if err != nil || failed.OK || failed.Status != StatusError {
		t.Fatalf("failed result = %#v, err = %v", failed, err)
	}
	if state := decodeState(failedTx); state.Error != "BigQuery query failed." || state.Status != StatusError {
		t.Fatalf("failed state = %#v", state)
	}
}

func TestWriteTrendsResultRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := map[string]any{"query": "prior", "generated_sql": "SELECT 1 LIMIT 10", "status": StatusReady, "insights": "prior insights"}
	tooManyColumns := make([]string, maxTrendsColumns+1)
	for i := range tooManyColumns {
		tooManyColumns[i] = "c"
	}
	tooManyRows := make([]Row, defaultRowLimit+1)
	for i := range tooManyRows {
		tooManyRows[i] = Row{"term": "x"}
	}

	cases := []struct {
		name string
		args WriteResultArgs
		code string
	}{
		{"missing query", WriteResultArgs{Query: "", SQL: "SELECT 1 LIMIT 10"}, "query_required"},
		{"query too large", WriteResultArgs{Query: strings.Repeat("q", maxTrendsQueryLength+1), SQL: "SELECT 1 LIMIT 10"}, "query_required"},
		{"missing sql", WriteResultArgs{Query: "q", SQL: ""}, "sql_required"},
		{"unsafe sql", WriteResultArgs{Query: "q", SQL: "DELETE FROM x"}, "unsafe_sql"},
		{"unbounded sql", WriteResultArgs{Query: "q", SQL: "SELECT * FROM x"}, "unsafe_sql"},
		{"too many columns", WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Columns: tooManyColumns}, "too_many_columns"},
		{"column name too large", WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Columns: []string{strings.Repeat("c", maxTrendsColumnNameLength+1)}}, "column_name_too_large"},
		{"too many rows", WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Rows: tooManyRows}, "too_many_rows"},
		{"insights too large", WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Insights: strings.Repeat("i", maxTrendsInsightsLength+1)}, "insights_too_large"},
		{"error too large", WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Error: strings.Repeat("e", maxTrendsErrorLength+1)}, "error_too_large"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx := agentruntime.NewTransaction(cloneSeed(seed))
			result, err := WriteTrendsResult(tx, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			state := decodeState(tx)
			if state.Query != "prior" || state.Insights != "prior insights" || state.Status != StatusReady {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestSetTrendsVerificationRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := map[string]any{"insights": "prior insights", "status": StatusEmpty}

	cases := []struct {
		name string
		args VerificationArgs
		code string
	}{
		{"missing verification", VerificationArgs{Verification: "   "}, "verification_required"},
		{"verification too large", VerificationArgs{Verification: strings.Repeat("v", maxTrendsVerificationLength+1)}, "verification_required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx := agentruntime.NewTransaction(cloneSeed(seed))
			result, err := SetTrendsVerification(tx, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			state := decodeState(tx)
			if state.Insights != "prior insights" || state.Status != StatusEmpty {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestSetTrendsVerificationRejectsWhenAppendedInsightsExceedCap(t *testing.T) {
	seed := map[string]any{"insights": strings.Repeat("i", maxTrendsInsightsLength-10), "status": StatusReady}
	tx := agentruntime.NewTransaction(cloneSeed(seed))
	result, err := SetTrendsVerification(tx, VerificationArgs{Verification: strings.Repeat("v", 100)})
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Error == nil || result.Error.Code != "insights_too_large" {
		t.Fatalf("result = %#v, want insights_too_large", result)
	}
	state := decodeState(tx)
	if state.Insights != strings.Repeat("i", maxTrendsInsightsLength-10) {
		t.Fatalf("state mutated on rejected input: %#v", state)
	}
}

func cloneSeed(seed map[string]any) map[string]any {
	clone := make(map[string]any, len(seed))
	for key, value := range seed {
		clone[key] = value
	}
	return clone
}

func TestSetTrendsVerificationAppendsSectionAndCreatesWhenEmpty(t *testing.T) {
	withInsights := agentruntime.NewTransaction(map[string]any{"insights": "Python leads."})
	if _, err := SetTrendsVerification(withInsights, VerificationArgs{Verification: "Confirmed by launch news."}); err != nil {
		t.Fatal(err)
	}
	state := decodeState(withInsights)
	if state.Insights != "Python leads.\n\n## Verification\n\nConfirmed by launch news." || state.Status != StatusReady {
		t.Fatalf("state = %#v", state)
	}

	empty := agentruntime.NewTransaction(nil)
	if _, err := SetTrendsVerification(empty, VerificationArgs{Verification: "No web context found."}); err != nil {
		t.Fatal(err)
	}
	if state := decodeState(empty); state.Insights != "## Verification\n\nNo web context found." {
		t.Fatalf("state = %#v", state)
	}
}
