package fitness

import (
	"context"
	"errors"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
)

const maxFitnessDocument = 1 << 20

type Result struct {
	OK            bool                          `json:"ok"`
	Length        int                           `json:"length,omitempty"`
	Count         int                           `json:"count,omitempty"`
	SyncedAt      string                        `json:"synced_at,omitempty"`
	Activities    []Activity                    `json:"activities,omitempty"`
	NextPageToken string                        `json:"next_page_token,omitempty"`
	Date          string                        `json:"date,omitempty"`
	Weekday       string                        `json:"weekday,omitempty"`
	Month         string                        `json:"month,omitempty"`
	Error         *agentruntime.StructuredError `json:"error,omitempty"`
}

type FetchActivitiesArgs struct {
	After         *int64  `json:"after,omitempty"`
	NextPageToken *string `json:"next_page_token,omitempty"`
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
type CurrentDateArgs struct{}

// FetchActivities is the ADK-facing tool handler: it resolves the Strava
// token, performs the API call, and publishes the resulting state. tokenCtx
// carries the Strava token (via WithStravaToken) separately from ctx because
// wrapping ctx directly would shadow its agent.Context-specific methods
// (State, Actions) that publishState needs.
func FetchActivities(ctx agent.Context, tokenCtx context.Context, input FetchActivitiesArgs, client *Strava, now func() time.Time) (Result, error) {
	if client == nil {
		return Result{}, errors.New("Strava client is required")
	}
	state := readState(ctx.State())
	if _, ok := StravaToken(tokenCtx); !ok {
		state.StravaConnected, state.Status = false, StatusIdle
		if err := publishState(ctx, state); err != nil {
			return Result{}, err
		}
		return fitnessFailure("strava_not_connected", "Connect Strava before syncing activities."), nil
	}
	state.StravaConnected, state.Status = true, StatusSyncing
	activities, next, err := client.Activities(tokenCtx, input.After, input.NextPageToken)
	if err != nil {
		state.Status = StatusIdle
		disconnected := errors.Is(err, ErrStravaDisconnected)
		if disconnected {
			state.StravaConnected = false
		}
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
		if disconnected {
			return fitnessFailure("strava_unauthorized", "Reconnect Strava before syncing activities."), nil
		}
		return fitnessFailure("strava_api_error", "Strava activities could not be loaded."), nil
	}
	result := mergeFetchedActivities(&state, input, activities, next, now)
	if err := publishState(ctx, state); err != nil {
		return Result{}, err
	}
	return result, nil
}

// mergeFetchedActivities applies one fetched page to state: pure logic,
// tested directly without a Strava client or ADK context.
func mergeFetchedActivities(state *FitnessState, input FetchActivitiesArgs, activities []Activity, next string, now func() time.Time) Result {
	if input.NextPageToken == nil || strings.TrimSpace(*input.NextPageToken) == "" || strings.TrimSpace(*input.NextPageToken) == "1" {
		state.Activities = activities
	} else {
		state.Activities = mergeActivities(state.Activities, activities)
	}
	if len(state.Activities) > 10_000 {
		state.Activities = state.Activities[:10_000]
	}
	if now == nil {
		now = time.Now
	}
	state.ActivitiesSyncedAt = now().UTC().Format(time.RFC3339)
	state.Status = StatusPlanning
	return Result{OK: true, Count: len(state.Activities), SyncedAt: state.ActivitiesSyncedAt, Activities: activities, NextPageToken: next}
}

func SetObjectiveResearch(ctx agent.Context, input ResearchArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setObjectiveResearch(&state, input)
	if err == nil && result.OK {
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
	}
	return result, err
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
	if err == nil && result.OK {
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
	}
	return result, err
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
	if err == nil && result.OK {
		if pubErr := publishState(ctx, state); pubErr != nil {
			return Result{}, pubErr
		}
	}
	return result, err
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

func GetCurrentDate(_ agent.Context, _ CurrentDateArgs) (Result, error) {
	date := common.DateDetails(nil)
	return Result{OK: true, Date: date.Date, Weekday: date.Weekday, Month: date.Month}, nil
}

func mergeActivities(existing, batch []Activity) []Activity {
	result := make([]Activity, 0, len(existing)+len(batch))
	seen := make(map[string]bool, len(existing)+len(batch))
	for _, group := range [][]Activity{existing, batch} {
		for _, activity := range group {
			if activity.ID == "" || seen[activity.ID] {
				continue
			}
			seen[activity.ID] = true
			result = append(result, activity)
		}
	}
	return result
}

func fitnessFailure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
