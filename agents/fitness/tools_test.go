package fitness

import (
	"context"
	"testing"
	"time"

	"agents/internal/fitnessdata"
)

type fakeActivityRepository struct{}

func (fakeActivityRepository) Sync(context.Context, string, string, []fitnessdata.Activity, time.Time) (fitnessdata.SyncResult, error) {
	return fitnessdata.SyncResult{}, nil
}

func (fakeActivityRepository) Snapshot(context.Context, string, int) (fitnessdata.Snapshot, error) {
	return fitnessdata.Snapshot{Connected: true, Source: fitnessdata.SourceHealthConnect, Activities: []fitnessdata.Activity{}}, nil
}

func TestFitnessActivityToolExistsWhenRepositoryIsConfigured(t *testing.T) {
	tools, err := (&activityToolset{repository: fakeActivityRepository{}}).Tools(nil)
	if err != nil || len(tools) != 1 || tools[0].Name() != "fetch_activities" {
		t.Fatalf("tools/error = %#v / %v", tools, err)
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
