package wellness

import (
	"testing"
)

func TestWellnessSpecialistPolicyRequiresKrogerAndFitnessFirst(t *testing.T) {
	state := Defaults()
	if got := specialistPolicy(state, "fitness_agent"); got == nil || got.Code != "connections_required" {
		t.Fatalf("disconnected policy = %#v", got)
	}
	state.KrogerConnected = true
	if got := specialistPolicy(state, "grocery_agent"); got == nil || got.Code != "fitness_plan_required" {
		t.Fatalf("out-of-order policy = %#v", got)
	}
	if got := specialistPolicy(state, "fitness_agent"); got != nil {
		t.Fatalf("fitness policy = %#v", got)
	}
	state.TrainingPlan = "run"
	if got := specialistPolicy(state, "grocery_agent"); got != nil {
		t.Fatalf("grocery policy = %#v", got)
	}
}

func TestWellnessCombinedPlanRequiresBothSpecialistOutputs(t *testing.T) {
	state := Defaults()
	result, _ := setWeeklyWellnessPlan(&state, PlanArgs{Plan: validWeeklyPlan()})
	if result.OK || result.Error == nil || result.Error.Code != "specialist_plans_required" {
		t.Fatalf("result = %#v", result)
	}
	state.FitnessDataConnected, state.KrogerConnected = true, true
	state.TrainingPlan, state.MealPlan = "run", "eat"
	result, _ = setWeeklyWellnessPlan(&state, PlanArgs{Plan: validWeeklyPlan()})
	ready, _ := markPlanReady(&state, ReadyArgs{Summary: "Balanced week"})
	if !result.OK || !ready.OK || state.Status != StatusReady {
		t.Fatalf("result/ready/state = %#v / %#v / %#v", result, ready, state)
	}
}

func validWeeklyPlan() string {
	return "## Recent Activity\nRuns\n\n## Recommended Hike\nPeak\n\n## This Week's Plan\nDaily plan"
}
