package fitness

import (
	"encoding/json"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

const AppName = "fitness_agent"

type Status string

const (
	StatusIdle     Status = "idle"
	StatusSyncing  Status = "syncing"
	StatusPlanning Status = "planning"
	StatusReady    Status = "ready"
)

type Activity struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	SportType           *string  `json:"sport_type,omitempty"`
	StartDate           *string  `json:"start_date,omitempty"`
	DistanceM           *float64 `json:"distance_m,omitempty"`
	MovingTimeS         *int     `json:"moving_time_s,omitempty"`
	ElapsedTimeS        *int     `json:"elapsed_time_s,omitempty"`
	TotalElevationGainM *float64 `json:"total_elevation_gain_m,omitempty"`
	AverageHeartrate    *float64 `json:"average_heartrate,omitempty"`
	PerceivedEffort     *int     `json:"perceived_effort,omitempty"`
}

type FitnessState struct {
	StravaConnected    bool       `json:"strava_connected"`
	Activities         []Activity `json:"activities"`
	ActivitiesSyncedAt string     `json:"activities_synced_at"`
	ObjectiveResearch  string     `json:"objective_research"`
	TrainingPlan       string     `json:"training_plan"`
	Status             Status     `json:"status"`
	ReviewSummary      string     `json:"review_summary"`
	UserID             string     `json:"user_id"`
}

func Defaults() FitnessState { return FitnessState{Activities: []Activity{}, Status: StatusIdle} }

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func decodeState(tx *agentruntime.Transaction) FitnessState {
	state := Defaults()
	if tx != nil {
		if encoded, err := json.Marshal(tx.Snapshot()); err == nil {
			_ = json.Unmarshal(encoded, &state)
		}
	}
	if state.Activities == nil {
		state.Activities = []Activity{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}

func writeState(tx *agentruntime.Transaction, state FitnessState) {
	tx.Set("strava_connected", state.StravaConnected)
	tx.Set("activities", state.Activities)
	tx.Set("activities_synced_at", state.ActivitiesSyncedAt)
	tx.Set("objective_research", state.ObjectiveResearch)
	tx.Set("training_plan", state.TrainingPlan)
	tx.Set("status", state.Status)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
}
