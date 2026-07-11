package fitness

import (
	"testing"
	"time"
)

func TestFitnessFetchMergesPagesWithoutDuplicateActivities(t *testing.T) {
	state := Defaults()
	now := func() time.Time { return time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC) }
	first := mergeFetchedActivities(&state, FetchActivitiesArgs{}, []Activity{{ID: "a", Name: "Run"}}, "2", now)
	page := "2"
	second := mergeFetchedActivities(&state, FetchActivitiesArgs{NextPageToken: &page}, []Activity{{ID: "a", Name: "Run"}, {ID: "b", Name: "Hike"}}, "", now)
	if !first.OK || !second.OK || len(state.Activities) != 2 || state.ActivitiesSyncedAt != "2026-07-10T12:00:00Z" || state.Status != StatusPlanning {
		t.Fatalf("results/state = %#v / %#v / %#v", first, second, state)
	}
}

func TestFitnessPlanMustExistBeforeReady(t *testing.T) {
	state := Defaults()
	failed, _ := markPlanReady(&state, ReadyArgs{Summary: "ready"})
	if failed.OK || failed.Error == nil || failed.Error.Code != "training_plan_required" {
		t.Fatalf("result = %#v", failed)
	}
	_, _ = setTrainingPlan(&state, TrainingPlanArgs{Plan: "## Monday\nEasy run"})
	ready, _ := markPlanReady(&state, ReadyArgs{Summary: "Balanced week"})
	if !ready.OK || state.Status != StatusReady {
		t.Fatalf("ready/state = %#v / %#v", ready, state)
	}
}
