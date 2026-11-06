package trends

import (
	json "encoding/json/v2"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

func TestNewBigQueryExecutorUsesFourGiBDefault(t *testing.T) {
	executor, err := NewBigQueryExecutor(&bigquery.Client{}, "project", "dataset", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if DefaultMaxBytesBilled != 4<<30 {
		t.Fatalf("DefaultMaxBytesBilled = %d, want %d", int64(DefaultMaxBytesBilled), int64(4<<30))
	}
	if executor.maxBytesBilled != DefaultMaxBytesBilled {
		t.Fatalf("maxBytesBilled = %d, want %d", executor.maxBytesBilled, int64(DefaultMaxBytesBilled))
	}
}

func TestClassifyBigQueryErrorRecognizesBytesBilledLimit(t *testing.T) {
	err := classifyBigQueryError(&googleapi.Error{
		Code:   400,
		Errors: []googleapi.ErrorItem{{Reason: "bytesBilledLimitExceeded"}},
	})
	if !errors.Is(err, errBigQueryBytesLimitExceeded) {
		t.Fatalf("classifyBigQueryError() = %v, want bytes billed limit error", err)
	}
}

func TestClassifyBigQueryErrorKeepsOtherFailuresGeneric(t *testing.T) {
	err := classifyBigQueryError(&googleapi.Error{
		Code:   403,
		Errors: []googleapi.ErrorItem{{Reason: "accessDenied"}},
	})
	if !errors.Is(err, errBigQueryFailed) {
		t.Fatalf("classifyBigQueryError() = %v, want generic query error", err)
	}
}

func TestBigQueryRejectsUnverifiedDatasetBeforeExecution(t *testing.T) {
	for _, scenario := range []struct {
		name       string
		statistics string
		allowed    bool
	}{
		{name: "allowed dataset", statistics: `{"query":{"statementType":"SELECT","referencedTables":[{"projectId":"project","datasetId":"dataset","tableId":"records"}]}}`, allowed: true},
		{name: "outside dataset", statistics: `{"query":{"statementType":"SELECT","referencedTables":[{"projectId":"otherproject","datasetId":"private","tableId":"records"}]}}`},
		{name: "incomplete table metadata", statistics: `{"query":{"statementType":"SELECT","referencedTables":[` + strings.TrimSuffix(strings.Repeat(`{"projectId":"project","datasetId":"dataset","tableId":"records"},`, 50), ",") + `]}}`},
		{name: "missing metadata", statistics: `{}`},
		{name: "non select", statistics: `{"query":{"statementType":"SCRIPT"}}`},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			dryRuns, executions := 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet && scenario.allowed {
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"jobComplete":true,"totalRows":"1","schema":{"fields":[{"name":"value","type":"INTEGER"}]},"rows":[{"f":[{"v":"1"}]}]}`))
					return
				}
				var request struct {
					Configuration struct {
						DryRun bool `json:"dryRun"`
					} `json:"configuration"`
				}
				if err := json.UnmarshalRead(r.Body, &request); err != nil {
					t.Errorf("decode request: %v", err)
				}
				if !request.Configuration.DryRun {
					executions++
					if scenario.allowed {
						w.Header().Set("Content-Type", "application/json")
						_, _ = w.Write([]byte(`{"jobReference":{"projectId":"project","jobId":"fixture"},"configuration":{"query":{"query":"SELECT 1"}},"status":{"state":"DONE"}}`))
						return
					}
					http.Error(w, "unexpected billable execution", http.StatusBadRequest)
					return
				}
				dryRuns++
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprintf(w, `{"jobReference":{"projectId":"project","jobId":"fixture"},"status":{"state":"DONE"},"statistics":%s}`, scenario.statistics)
			}))
			defer server.Close()
			client, err := bigquery.NewClient(t.Context(), "project", option.WithEndpoint(server.URL), option.WithoutAuthentication())
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = client.Close() }()
			executor, err := NewBigQueryExecutor(client, "project", "dataset", 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			sql := "SELECT * FROM otherproject.private.records LIMIT 1"
			if scenario.allowed {
				sql = "SELECT * FROM project.dataset.records LIMIT 1"
			}
			result, err := executor.ExecuteBigQuery(t.Context(), sql)
			if scenario.allowed {
				if err != nil || dryRuns != 1 || executions != 1 || len(result.Rows) != 1 || result.Rows[0]["value"] != int64(1) {
					t.Fatalf("allowed query: result = %#v, error = %v, dry runs = %d, executions = %d", result, err, dryRuns, executions)
				}
				return
			}
			if !errors.Is(err, ErrUnsafeSQL) || dryRuns != 1 || executions != 0 {
				t.Fatalf("error = %v, dry runs = %d, executions = %d; want unsafe SQL, 1, 0", err, dryRuns, executions)
			}
		})
	}
}
