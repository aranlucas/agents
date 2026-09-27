package cloudflare

import (
	"database/sql"
	json "encoding/json/v2"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agui"

	_ "modernc.org/sqlite"
)

func TestD1ActiveRunLeaseReplayStopAndReplacement(t *testing.T) {
	d1 := newSQLiteD1Fixture(t)
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	service := &SessionService{d1: d1, now: func() time.Time { return now }}
	key := agui.ActiveRunKey{AppName: "resume_agent", UserID: "user-1", ThreadID: "thread-1"}

	if err := service.BeginActiveRun(t.Context(), key, "run-1", now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := service.BeginActiveRun(t.Context(), key, "run-2", now.Add(time.Minute)); !errors.Is(err, agui.ErrActiveRunExists) {
		t.Fatalf("second lease error = %v", err)
	}
	started := []byte(`{"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}`)
	finished := []byte(`{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1"}`)
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 1, finished, true); !errors.Is(err, agui.ErrActiveRunNotFound) {
		t.Fatalf("out-of-order event error = %v", err)
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, started, false); err != nil {
		t.Fatal(err)
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, started, false); err != nil {
		t.Fatalf("idempotent event retry: %v", err)
	}
	conflicting := []byte(`{"type":"RUN_STARTED","threadId":"thread-1","runId":"other"}`)
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, conflicting, false); err == nil {
		t.Fatal("conflicting event retry succeeded")
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 1, finished, true); err != nil {
		t.Fatal(err)
	}
	snapshot, err := service.LoadActiveRun(t.Context(), key, "run-1", 0)
	if err != nil || !snapshot.Finished || len(snapshot.Events) != 2 {
		t.Fatalf("finished snapshot = %#v, %v", snapshot, err)
	}
	if _, err := service.CurrentActiveRun(t.Context(), key); !errors.Is(err, agui.ErrActiveRunNotFound) {
		t.Fatalf("finished run remained current: %v", err)
	}

	if err := service.BeginActiveRun(t.Context(), key, "run-2", now.Add(time.Minute)); err != nil {
		t.Fatalf("replacement lease: %v", err)
	}
	stopped, err := service.RequestActiveRunStop(t.Context(), key)
	if err != nil || !stopped {
		t.Fatalf("RequestActiveRunStop() = %t, %v", stopped, err)
	}
	snapshot, err = service.CurrentActiveRun(t.Context(), key)
	if err != nil || !snapshot.StopRequested || snapshot.RunID != "run-2" || len(snapshot.Events) != 0 {
		t.Fatalf("replacement snapshot = %#v, %v", snapshot, err)
	}
}

func newSQLiteD1Fixture(t *testing.T) *D1 {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatal(err)
	}
	for _, statement := range splitMigrationStatements(migrations[len(migrations)-1].source) {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("active-run migration: %v", err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		var envelope batchRequest
		if err := json.UnmarshalRead(request.Body, &envelope); err != nil {
			http.Error(w, "invalid D1 request", http.StatusBadRequest)
			return
		}
		tx, err := db.BeginTx(request.Context(), nil)
		if err != nil {
			t.Error(err)
			return
		}
		results := make([]map[string]any, 0, len(envelope.Batch))
		for _, statement := range envelope.Batch {
			trimmed := strings.TrimSpace(statement.SQL)
			if strings.HasPrefix(trimmed, "SELECT") {
				rows, queryErr := tx.QueryContext(request.Context(), statement.SQL, statement.Params...)
				if queryErr != nil {
					_ = tx.Rollback()
					t.Errorf("query %q: %v", statement.SQL, queryErr)
					return
				}
				columns, _ := rows.Columns()
				encodedRows := make([]map[string]any, 0)
				for rows.Next() {
					values := make([]any, len(columns))
					pointers := make([]any, len(columns))
					for index := range columns {
						pointers[index] = &values[index]
					}
					if err := rows.Scan(pointers...); err != nil {
						_ = rows.Close()
						_ = tx.Rollback()
						t.Error(err)
						return
					}
					row := make(map[string]any, len(columns))
					for index, column := range columns {
						if bytes, ok := values[index].([]byte); ok {
							values[index] = string(bytes)
						}
						row[column] = values[index]
					}
					encodedRows = append(encodedRows, row)
				}
				_ = rows.Close()
				results = append(results, map[string]any{"success": true, "results": encodedRows, "meta": map[string]any{"changes": 0}})
				continue
			}
			result, execErr := tx.ExecContext(request.Context(), statement.SQL, statement.Params...)
			if execErr != nil {
				_ = tx.Rollback()
				t.Errorf("exec %q: %v", statement.SQL, execErr)
				return
			}
			changes, _ := result.RowsAffected()
			results = append(results, map[string]any{"success": true, "results": []any{}, "meta": map[string]any{"changes": changes}})
		}
		if err := tx.Commit(); err != nil {
			t.Error(err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.MarshalWrite(w, map[string]any{"success": true, "result": results})
	}))
	t.Cleanup(server.Close)
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	return d1
}
