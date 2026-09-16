package fitness

import (
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/fitnessdata"
	"google.golang.org/adk/v2/agent"
)

const maxFitnessDocument = 1 << 20

type Result struct {
	OK         bool                          `json:"ok"`
	Length     int                           `json:"length,omitzero"`
	Count      int                           `json:"count,omitzero"`
	SyncedAt   string                        `json:"synced_at,omitempty"`
	Activities []Activity                    `json:"activities,omitempty"`
	Error      *agentruntime.StructuredError `json:"error,omitempty"`
}

type FetchActivitiesArgs struct {
	Limit int `json:"limit,omitzero"`
}
type ResearchArgs struct {
	Research string `json:"research"`
}
type TrainingPlanArgs struct {
	Plan string `json:"plan"`
}
type ReadyArgs struct {
	Summary string `json:"summary"`
}

// FetchActivities loads the authenticated user's provider-neutral D1 snapshot
// and publishes the bounded activity context used by the planning agent.
func FetchActivities(ctx agent.Context, input FetchActivitiesArgs, repository fitnessdata.Repository) (Result, error) {
	if repository == nil {
		return Result{}, nil
	}
	state := readState(ctx.State())
	state.Status = StatusSyncing
	limit := input.Limit
	if limit <= 0 {
		limit = fitnessdata.DefaultListLimit
	}
	snapshot, err := repository.Snapshot(ctx, ctx.UserID(), limit)
	if err != nil {
		state.Status = StatusIdle
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, err
		}
		return fitnessFailure("fitness_data_load_error", "Synced fitness activities could not be loaded."), nil
	}
	state.FitnessDataConnected = snapshot.Connected
	state.ActivitySource = snapshot.Source
	state.Activities = snapshot.Activities
	state.ActivitiesSyncedAt = snapshot.SyncedAt
	state.Status = StatusPlanning
	if err := ctx.State().Set("fitness_data_connected", state.FitnessDataConnected); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("activity_source", state.ActivitySource); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("activities", state.Activities); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("activities_synced_at", state.ActivitiesSyncedAt); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if !snapshot.Connected {
		return fitnessFailure("fitness_data_not_connected", "Connect Health Connect in the mobile app before planning from recent activity."), nil
	}
	return Result{OK: true, Count: len(snapshot.Activities), SyncedAt: snapshot.SyncedAt, Activities: snapshot.Activities}, nil
}

func SetObjectiveResearch(ctx agent.Context, input ResearchArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setObjectiveResearch(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("objective_research", state.ObjectiveResearch); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setObjectiveResearch(state *FitnessState, input ResearchArgs) (Result, error) {
	if len(input.Research) > maxFitnessDocument {
		return fitnessFailure("research_too_large", "objective research exceeds the allowed size"), nil
	}
	state.ObjectiveResearch, state.Status = input.Research, StatusPlanning
	return Result{OK: true, Length: len(input.Research)}, nil
}

func SetTrainingPlan(ctx agent.Context, input TrainingPlanArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setTrainingPlan(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("training_plan", state.TrainingPlan); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setTrainingPlan(state *FitnessState, input TrainingPlanArgs) (Result, error) {
	if len(input.Plan) > maxFitnessDocument {
		return fitnessFailure("plan_too_large", "training plan exceeds the allowed size"), nil
	}
	state.TrainingPlan, state.Status = input.Plan, StatusPlanning
	return Result{OK: true, Length: len(input.Plan)}, nil
}

func MarkPlanReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markPlanReady(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func markPlanReady(state *FitnessState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return fitnessFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if strings.TrimSpace(state.TrainingPlan) == "" {
		return fitnessFailure("training_plan_required", "a training plan is required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, strings.TrimSpace(input.Summary)
	return Result{OK: true}, nil
}

func fitnessFailure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
