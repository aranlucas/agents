package fitness

import (
	"encoding/json"
	"fmt"

	"agents/internal/fitnessdata"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

const AppName = "fitness_agent"

type Status string

const (
	StatusIdle     Status = "idle"
	StatusSyncing  Status = "syncing"
	StatusPlanning Status = "planning"
	StatusReady    Status = "ready"
)

type Activity = fitnessdata.Activity

type FitnessState struct {
	FitnessDataConnected bool       `json:"fitness_data_connected"`
	ActivitySource       string     `json:"activity_source"`
	Activities           []Activity `json:"activities"`
	ActivitiesSyncedAt   string     `json:"activities_synced_at"`
	ObjectiveResearch    string     `json:"objective_research"`
	TrainingPlan         string     `json:"training_plan"`
	Status               Status     `json:"status"`
	ReviewSummary        string     `json:"review_summary"`
	UserID               string     `json:"user_id"`
}

func Defaults() FitnessState { return FitnessState{Activities: []Activity{}, Status: StatusIdle} }

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) FitnessState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		for key, value := range source.All() {
			values[key] = value
		}
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Activities == nil {
		state.Activities = []Activity{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}

func publishState(ctx agent.Context, state FitnessState) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"fitness_data_connected", state.FitnessDataConnected},
		{"activity_source", state.ActivitySource},
		{"activities", state.Activities},
		{"activities_synced_at", state.ActivitiesSyncedAt},
		{"objective_research", state.ObjectiveResearch},
		{"training_plan", state.TrainingPlan},
		{"status", state.Status},
		{"review_summary", state.ReviewSummary},
		{"user_id", state.UserID},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}
