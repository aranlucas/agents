package wellness

import (
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
)

const maxWellnessDocument = 1 << 20

type Result struct {
	OK      bool                          `json:"ok"`
	Length  int                           `json:"length,omitempty"`
	Date    string                        `json:"date,omitempty"`
	Weekday string                        `json:"weekday,omitempty"`
	Month   string                        `json:"month,omitempty"`
	Error   *agentruntime.StructuredError `json:"error,omitempty"`
}

type PlanArgs struct {
	Plan string `json:"plan"`
}
type ReadyArgs struct {
	Summary string `json:"summary"`
}
type CurrentDateArgs struct{}

func SetWeeklyWellnessPlan(ctx agent.Context, input PlanArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setWeeklyWellnessPlan(&state, input)
	if err == nil && result.OK {
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
	}
	return result, err
}

func setWeeklyWellnessPlan(state *WellnessState, input PlanArgs) (Result, error) {
	if len(input.Plan) > maxWellnessDocument {
		return wellnessFailure("weekly_plan_too_large", "weekly wellness plan exceeds the allowed size"), nil
	}
	for _, heading := range []string{"## Recent Activity", "## Recommended Hike", "## This Week's Plan"} {
		if !strings.Contains(input.Plan, heading) {
			return wellnessFailure("invalid_weekly_plan", "weekly plan is missing required sections"), nil
		}
	}
	if !state.KrogerConnected || !state.FitnessDataConnected || strings.TrimSpace(state.TrainingPlan) == "" || strings.TrimSpace(state.MealPlan) == "" {
		return wellnessFailure("specialist_plans_required", "connected fitness and grocery specialist plans are required"), nil
	}
	state.WeeklyPlan, state.Status = input.Plan, StatusPlanning
	return Result{OK: true, Length: len(input.Plan)}, nil
}

func MarkPlanReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markPlanReady(&state, input)
	if err == nil && result.OK {
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
	}
	return result, err
}

func markPlanReady(state *WellnessState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return wellnessFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if strings.TrimSpace(state.TrainingPlan) == "" || strings.TrimSpace(state.MealPlan) == "" || strings.TrimSpace(state.WeeklyPlan) == "" {
		return wellnessFailure("weekly_plan_incomplete", "fitness, grocery, and combined plans are required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, strings.TrimSpace(input.Summary)
	return Result{OK: true}, nil
}

func GetCurrentDate(_ agent.Context, _ CurrentDateArgs) (Result, error) {
	date := common.DateDetails(nil)
	return Result{OK: true, Date: date.Date, Weekday: date.Weekday, Month: date.Month}, nil
}

func specialistPolicy(state WellnessState, toolName string) *agentruntime.StructuredError {
	if toolName != "fitness_agent" && toolName != "grocery_agent" {
		return nil
	}
	if !state.KrogerConnected {
		return &agentruntime.StructuredError{Code: "connections_required", Message: "connect Kroger before delegation"}
	}
	if toolName == "grocery_agent" && strings.TrimSpace(state.TrainingPlan) == "" {
		return &agentruntime.StructuredError{Code: "fitness_plan_required", Message: "fitness_agent must complete before grocery_agent"}
	}
	return nil
}

func wellnessFailure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
