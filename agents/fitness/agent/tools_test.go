package fitness

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"agents/internal/agentruntime"
)

func TestFitnessFetchMergesPagesWithoutDuplicateActivities(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		page := request.URL.Query().Get("page")
		payload := []map[string]any{{"id": "a", "name": "Run"}}
		if page == "2" {
			payload = []map[string]any{{"id": "a", "name": "Run"}, {"id": "b", "name": "Hike"}}
		}
		_ = json.NewEncoder(w).Encode(payload)
	}))
	t.Cleanup(server.Close)
	tx := agentruntime.NewTransaction(StateDefaults())
	now := func() time.Time { return time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC) }
	ctx := WithStravaToken(context.Background(), "token")
	first, err := FetchActivities(ctx, tx, FetchActivitiesArgs{}, NewStrava(server.Client(), server.URL), now)
	page := "2"
	second, secondErr := FetchActivities(ctx, tx, FetchActivitiesArgs{NextPageToken: &page}, NewStrava(server.Client(), server.URL), now)
	state := decodeState(tx)
	if err != nil || secondErr != nil || !first.OK || !second.OK || len(state.Activities) != 2 || state.ActivitiesSyncedAt != "2026-07-10T12:00:00Z" || state.Status != StatusPlanning {
		t.Fatalf("results/state/errors = %#v / %#v / %#v / %v / %v", first, second, state, err, secondErr)
	}
}

func TestFitnessPlanMustExistBeforeReady(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	failed, _ := MarkPlanReady(context.Background(), tx, ReadyArgs{Summary: "ready"})
	if failed.OK || failed.Error == nil || failed.Error.Code != "training_plan_required" {
		t.Fatalf("result = %#v", failed)
	}
	_, _ = SetTrainingPlan(context.Background(), tx, TrainingPlanArgs{Plan: "## Monday\nEasy run"})
	ready, _ := MarkPlanReady(context.Background(), tx, ReadyArgs{Summary: "Balanced week"})
	if !ready.OK || decodeState(tx).Status != StatusReady {
		t.Fatalf("ready/state = %#v / %#v", ready, decodeState(tx))
	}
}
