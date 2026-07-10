package wellness

import (
	"context"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestWellnessSpecialistPolicyRequiresConnectionsAndFitnessFirst(t *testing.T) {
	state := Defaults()
	if got := specialistPolicy(state, "fitness_agent"); got == nil || got.Code != "connections_required" {
		t.Fatalf("disconnected policy = %#v", got)
	}
	state.StravaConnected, state.KrogerConnected = true, true
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
	tx := agentruntime.NewTransaction(StateDefaults())
	result, _ := SetWeeklyWellnessPlan(context.Background(), tx, PlanArgs{Plan: validWeeklyPlan()})
	if result.OK || result.Error == nil || result.Error.Code != "specialist_plans_required" {
		t.Fatalf("result = %#v", result)
	}
	state := StateDefaults()
	state["strava_connected"], state["kroger_connected"] = true, true
	state["training_plan"], state["meal_plan"] = "run", "eat"
	tx = agentruntime.NewTransaction(state)
	result, _ = SetWeeklyWellnessPlan(context.Background(), tx, PlanArgs{Plan: validWeeklyPlan()})
	ready, _ := MarkPlanReady(context.Background(), tx, ReadyArgs{Summary: "Balanced week"})
	if !result.OK || !ready.OK || decodeState(tx).Status != StatusReady {
		t.Fatalf("result/ready/state = %#v / %#v / %#v", result, ready, decodeState(tx))
	}
}

func validWeeklyPlan() string {
	return "## Recent Activity\nRuns\n\n## Recommended Hike\nPeak\n\n## This Week's Plan\nDaily plan"
}
