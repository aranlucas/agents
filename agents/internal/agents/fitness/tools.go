package fitness

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
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

func FetchActivities(ctx context.Context, tx *agentruntime.Transaction, input FetchActivitiesArgs, client *Strava, now func() time.Time) (Result, error) {
	if client == nil {
		return Result{}, errors.New("Strava client is required")
	}
	state := decodeState(tx)
	if _, ok := StravaToken(ctx); !ok {
		state.StravaConnected, state.Status = false, StatusIdle
		writeState(tx, state)
		return fitnessFailure("strava_not_connected", "Connect Strava before syncing activities."), nil
	}
	state.StravaConnected, state.Status = true, StatusSyncing
	activities, next, err := client.Activities(ctx, input.After, input.NextPageToken)
	if err != nil {
		state.Status = StatusIdle
		writeState(tx, state)
		if errors.Is(err, ErrStravaDisconnected) {
			state.StravaConnected = false
			writeState(tx, state)
			return fitnessFailure("strava_unauthorized", "Reconnect Strava before syncing activities."), nil
		}
		return fitnessFailure("strava_api_error", "Strava activities could not be loaded."), nil
	}
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
	writeState(tx, state)
	return Result{OK: true, Count: len(state.Activities), SyncedAt: state.ActivitiesSyncedAt, Activities: activities, NextPageToken: next}, nil
}

func SetObjectiveResearch(_ context.Context, tx *agentruntime.Transaction, input ResearchArgs) (Result, error) {
	if len(input.Research) > maxFitnessDocument {
		return fitnessFailure("research_too_large", "objective research exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	state.ObjectiveResearch, state.Status = input.Research, StatusPlanning
	writeState(tx, state)
	return Result{OK: true, Length: len(input.Research)}, nil
}

func SetTrainingPlan(_ context.Context, tx *agentruntime.Transaction, input TrainingPlanArgs) (Result, error) {
	if len(input.Plan) > maxFitnessDocument {
		return fitnessFailure("plan_too_large", "training plan exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	state.TrainingPlan, state.Status = input.Plan, StatusPlanning
	writeState(tx, state)
	return Result{OK: true, Length: len(input.Plan)}, nil
}

func MarkPlanReady(_ context.Context, tx *agentruntime.Transaction, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return fitnessFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	if strings.TrimSpace(state.TrainingPlan) == "" {
		return fitnessFailure("training_plan_required", "a training plan is required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, strings.TrimSpace(input.Summary)
	writeState(tx, state)
	return Result{OK: true}, nil
}

func GetCurrentDate(_ context.Context, _ *agentruntime.Transaction, _ CurrentDateArgs) (Result, error) {
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
