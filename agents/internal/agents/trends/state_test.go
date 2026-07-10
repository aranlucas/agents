package trends

import (
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

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
