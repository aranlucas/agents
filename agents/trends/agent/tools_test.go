package trends

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateSQLRejectsMutationAndMissingLimit(t *testing.T) {
	for _, sql := range []string{
		"DELETE FROM x",
		"SELECT * FROM x",
		"SELECT * FROM x LIMIT 10; DROP TABLE x",
		"SELECTED value FROM x LIMIT 10",
		"WITHOUT x AS (SELECT 1) SELECT * FROM x LIMIT 10",
	} {
		if err := ValidateSQL(sql); err == nil {
			t.Fatalf("ValidateSQL(%q) accepted unsafe query", sql)
		}
	}
	for _, sql := range []string{
		"SELECT\nterm, rank FROM `bigquery-public-data.google_trends.top_terms` LIMIT 5;",
		"SELECT\tterm FROM `bigquery-public-data.google_trends.top_terms` LIMIT 5",
		"WITH\n x AS (SELECT 1) SELECT * FROM x LIMIT 10",
	} {
		if err := ValidateSQL(sql); err != nil {
			t.Fatalf("ValidateSQL(%q) rejected bounded query: %v", sql, err)
		}
	}
}

func TestBuildA2UIUsesTrendsCatalog(t *testing.T) {
	event := BuildA2UI(TrendsResult{Query: "cats", SQL: "SELECT 1 LIMIT 10", Columns: []string{"week", "value"}, Rows: []Row{{"week": "2026-01-01", "value": int64(3)}}})
	content, ok := event.Content.(a2uiEnvelope)
	if !ok || len(content.Operations) == 0 {
		t.Fatalf("content = %T %#v, want populated a2uiEnvelope", event.Content, event.Content)
	}
	envelope := activityEnvelope{MessageID: event.MessageID, Content: content}
	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	if event.ActivityType != "a2ui-surface" || !strings.Contains(string(encoded), trendsCatalogID) || !strings.Contains(string(encoded), "SqlDisclosure") {
		t.Fatalf("event = %s", encoded)
	}
	envelopeJSON, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(envelopeJSON), `"content":"`) {
		t.Fatalf("activity content was double encoded: %s", envelopeJSON)
	}
}

func TestBigQueryAllowlistRejectsOtherDatasets(t *testing.T) {
	executor := &BigQueryExecutor{project: "bigquery-public-data", dataset: "google_trends"}
	if err := executor.validateTables("SELECT * FROM `other.secret.table` LIMIT 1"); !errors.Is(err, ErrUnsafeSQL) {
		t.Fatalf("error = %v", err)
	}
	if err := executor.validateTables("SELECT * FROM `bigquery-public-data.google_trends.top_terms` LIMIT 1"); err != nil {
		t.Fatal(err)
	}
}
