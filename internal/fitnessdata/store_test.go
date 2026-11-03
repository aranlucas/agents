package fitnessdata

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"testing"

	"github.com/aranlucas/agents/internal/storage"
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
	results []storage.Result
}

func (f *fakeRunner) Run(_ context.Context, _ ...storage.Statement) ([]storage.Result, error) {
	return f.results, nil
}

func TestSnapshotDecodesProviderNeutralActivities(t *testing.T) {
	runner := &fakeRunner{results: []storage.Result{
		{Rows: rawRows(t, map[string]any{"source": SourceHealthConnect, "synced_at": "2026-07-12T13:00:00Z"}), Success: true},
		{Rows: rawRows(t, map[string]any{
			"source_activity_id": "activity-1", "source": SourceHealthConnect,
			"name": "Morning run", "start_date": "2026-07-12T12:00:00Z",
			"distance_m": 5000.0, "elapsed_time_s": 1500,
		}), Success: true},
	}}
	snapshot, err := (&Store{db: runner}).Snapshot(t.Context(), "user-1", 10)
	if err != nil || !snapshot.Connected || snapshot.Source != SourceHealthConnect || len(snapshot.Activities) != 1 {
		t.Fatalf("snapshot/error = %#v / %v", snapshot, err)
	}
	activity := snapshot.Activities[0]
	if activity.DistanceM == nil || *activity.DistanceM != 5000 || activity.ElapsedTimeS == nil || *activity.ElapsedTimeS != 1500 {
		t.Fatalf("activity = %#v", activity)
	}
}
