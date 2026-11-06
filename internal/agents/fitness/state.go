package fitness

import (
	"github.com/aranlucas/agents/internal/agentruntime"

	"github.com/aranlucas/agents/internal/fitnessdata"
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
}

func Defaults() FitnessState { return FitnessState{Activities: []Activity{}, Status: StatusIdle} }

func StateDefaults() map[string]any {
	return agentruntime.StateMap(Defaults())
}

func readState(source session.ReadonlyState) FitnessState {
	state := agentruntime.ReadState(source, Defaults())
	if state.Activities == nil {
		state.Activities = []Activity{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}
