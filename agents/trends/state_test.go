package trends

import (
	"strings"
	"testing"
)

func TestBeginTrendsQueryRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := TrendsState{Query: "prior", GeneratedSQL: "SELECT 1 LIMIT 10", Status: StatusReady}

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
			state := seed
			result, err := beginTrendsQuery(&state, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			if state.Query != "prior" || state.GeneratedSQL != "SELECT 1 LIMIT 10" || state.Status != StatusReady {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestBeginTrendsQueryClearsPriorResultAndMarksQuerying(t *testing.T) {
	state := TrendsState{Columns: []string{"stale"}, Rows: []Row{{"stale": true}}, Insights: "stale", Error: "stale"}
	result, err := beginTrendsQuery(&state, BeginQueryArgs{Query: "top terms", SQL: "```sql\nSELECT 1 LIMIT 10\n```"})
	if err != nil || !result.OK || result.Status != StatusQuerying {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
	if state.Query != "top terms" || state.GeneratedSQL != "SELECT 1 LIMIT 10" || state.Status != StatusQuerying {
		t.Fatalf("state = %#v", state)
	}
	if len(state.Columns) != 0 || len(state.Rows) != 0 || state.Insights != "" || state.Error != "" {
		t.Fatalf("prior result not cleared: %#v", state)
	}
}

func TestWriteTrendsResultDistinguishesReadyEmptyAndError(t *testing.T) {
	readyState := Defaults()
	ready, err := writeTrendsResult(&readyState, WriteResultArgs{
		Query: "q", SQL: "SELECT 1 LIMIT 10", Columns: []string{"term"}, Rows: []Row{{"term": "python"}}, Insights: "Python leads.",
	})
	if err != nil || !ready.OK || ready.Status != StatusReady || ready.RowCount != 1 {
		t.Fatalf("ready result = %#v, err = %v", ready, err)
	}

	emptyState := Defaults()
	empty, err := writeTrendsResult(&emptyState, WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Insights: "No matches."})
	if err != nil || !empty.OK || empty.Status != StatusEmpty || empty.RowCount != 0 {
		t.Fatalf("empty result = %#v, err = %v", empty, err)
	}

	failedState := Defaults()
	failed, err := writeTrendsResult(&failedState, WriteResultArgs{Query: "q", SQL: "SELECT 1 LIMIT 10", Error: "BigQuery query failed."})
	if err != nil || failed.OK || failed.Status != StatusError {
		t.Fatalf("failed result = %#v, err = %v", failed, err)
	}
	if failedState.Error != "BigQuery query failed." || failedState.Status != StatusError {
		t.Fatalf("failed state = %#v", failedState)
	}
}

func TestWriteTrendsResultRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := TrendsState{Query: "prior", GeneratedSQL: "SELECT 1 LIMIT 10", Status: StatusReady, Insights: "prior insights"}
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
			state := seed
			result, err := writeTrendsResult(&state, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			if state.Query != "prior" || state.Insights != "prior insights" || state.Status != StatusReady {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestSetTrendsVerificationRejectsInvalidInputWithoutMutatingState(t *testing.T) {
	seed := TrendsState{Insights: "prior insights", Status: StatusEmpty}

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
			state := seed
			result, err := setTrendsVerification(&state, tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if result.OK || result.Error == nil || result.Error.Code != tc.code {
				t.Fatalf("result = %#v, want error code %q", result, tc.code)
			}
			if state.Insights != "prior insights" || state.Status != StatusEmpty {
				t.Fatalf("state mutated on rejected input: %#v", state)
			}
		})
	}
}

func TestSetTrendsVerificationRejectsWhenAppendedInsightsExceedCap(t *testing.T) {
	state := TrendsState{Insights: strings.Repeat("i", maxTrendsInsightsLength-10), Status: StatusReady}
	result, err := setTrendsVerification(&state, VerificationArgs{Verification: strings.Repeat("v", 100)})
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Error == nil || result.Error.Code != "insights_too_large" {
		t.Fatalf("result = %#v, want insights_too_large", result)
	}
	if state.Insights != strings.Repeat("i", maxTrendsInsightsLength-10) {
		t.Fatalf("state mutated on rejected input: %#v", state)
	}
}

func TestSetTrendsVerificationAppendsSectionAndCreatesWhenEmpty(t *testing.T) {
	withInsights := TrendsState{Insights: "Python leads."}
	if _, err := setTrendsVerification(&withInsights, VerificationArgs{Verification: "Confirmed by launch news."}); err != nil {
		t.Fatal(err)
	}
	if withInsights.Insights != "Python leads.\n\n## Verification\n\nConfirmed by launch news." || withInsights.Status != StatusReady {
		t.Fatalf("state = %#v", withInsights)
	}

	empty := Defaults()
	if _, err := setTrendsVerification(&empty, VerificationArgs{Verification: "No web context found."}); err != nil {
		t.Fatal(err)
	}
	if empty.Insights != "## Verification\n\nNo web context found." {
		t.Fatalf("state = %#v", empty)
	}
}
