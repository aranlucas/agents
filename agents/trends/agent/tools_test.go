package trends

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateSQLRejectsMutationAndMissingLimit(t *testing.T) {
	for _, sql := range []string{"DELETE FROM x", "SELECT * FROM x", "SELECT * FROM x LIMIT 10; DROP TABLE x"} {
		if err := ValidateSQL(sql); err == nil {
			t.Fatalf("ValidateSQL(%q) accepted unsafe query", sql)
		}
	}
	if err := ValidateSQL("WITH x AS (SELECT 1) SELECT * FROM x LIMIT 10"); err != nil {
		t.Fatal(err)
	}
}

func TestBuildA2UIUsesTrendsCatalog(t *testing.T) {
	event := BuildA2UI(TrendsResult{Query: "cats", SQL: "SELECT 1 LIMIT 10", Columns: []string{"week", "value"}, Rows: []Row{{"week": "2026-01-01", "value": int64(3)}}})
	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	if event.ActivityType != "a2ui-surface" || !strings.Contains(string(encoded), trendsCatalogID) || !strings.Contains(string(encoded), "SqlDisclosure") {
		t.Fatalf("event = %s", encoded)
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
