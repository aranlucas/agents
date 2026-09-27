package fitnessdata

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/cloudflare"
)

func rawRows(t *testing.T, rows ...any) []jsontext.Value {
	t.Helper()
	encoded := make([]jsontext.Value, len(rows))
	for i, row := range rows {
		data, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		encoded[i] = data
	}
	return encoded
}

type fakeRunner struct {
	statements []cloudflare.Statement
	results    []cloudflare.Result
}

func (f *fakeRunner) Run(_ context.Context, statements ...cloudflare.Statement) ([]cloudflare.Result, error) {
	f.statements = append([]cloudflare.Statement(nil), statements...)
	return f.results, nil
}

func TestSyncUsesIdempotentActivityUpsertAndSourceCheckpoint(t *testing.T) {
	start := "2026-07-12T12:00:00Z"
	runner := &fakeRunner{}
	store := &Store{d1: runner}
	result, err := store.Sync(t.Context(), "user-1", SourceHealthConnect, []Activity{{
		ID: "activity-1", Name: "Morning run", StartDate: &start,
	}}, time.Date(2026, 7, 12, 13, 0, 0, 0, time.UTC))
	if err != nil || result.Accepted != 1 || result.SyncedAt != "2026-07-12T13:00:00Z" {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if len(runner.statements) != 2 {
		t.Fatalf("statements = %#v", runner.statements)
	}
	if !strings.Contains(runner.statements[0].SQL, "ON CONFLICT(user_id, source, source_activity_id) DO UPDATE") {
		t.Fatalf("activity write is not idempotent: %s", runner.statements[0].SQL)
	}
	if !strings.Contains(runner.statements[1].SQL, "ON CONFLICT(user_id, source) DO UPDATE") {
		t.Fatalf("checkpoint write is not idempotent: %s", runner.statements[1].SQL)
	}
}

func TestSnapshotDecodesProviderNeutralActivities(t *testing.T) {
	runner := &fakeRunner{results: []cloudflare.Result{
		{Rows: rawRows(t, map[string]any{"source": SourceHealthConnect, "synced_at": "2026-07-12T13:00:00Z"}), Success: true},
		{Rows: rawRows(t, map[string]any{
			"source_activity_id": "activity-1", "source": SourceHealthConnect,
			"name": "Morning run", "start_date": "2026-07-12T12:00:00Z",
			"distance_m": 5000.0, "elapsed_time_s": 1500,
		}), Success: true},
	}}
	snapshot, err := (&Store{d1: runner}).Snapshot(t.Context(), "user-1", 10)
	if err != nil || !snapshot.Connected || snapshot.Source != SourceHealthConnect || len(snapshot.Activities) != 1 {
		t.Fatalf("snapshot/error = %#v / %v", snapshot, err)
	}
	activity := snapshot.Activities[0]
	if activity.DistanceM == nil || *activity.DistanceM != 5000 || activity.ElapsedTimeS == nil || *activity.ElapsedTimeS != 1500 {
		t.Fatalf("activity = %#v", activity)
	}
}
