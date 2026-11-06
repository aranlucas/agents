package wellness

import (
	"github.com/aranlucas/agents/internal/agentruntime"

	"github.com/aranlucas/agents/internal/agents/fitness"
	"github.com/aranlucas/agents/internal/agents/grocery"
	"github.com/aranlucas/agents/internal/common"
	"google.golang.org/adk/v2/session"
)

const AppName = "wellness_agent"

type Status string

const (
	StatusIdle       Status = "idle"
	StatusDelegating Status = "delegating"
	StatusPlanning   Status = "planning"
	StatusReady      Status = "ready"
)

type WellnessState struct {
	Status               Status                       `json:"status"`
	MealPlan             string                       `json:"meal_plan"`
	WeeklyPlan           string                       `json:"weekly_plan"`
	ReviewSummary        string                       `json:"review_summary"`
	KrogerConnected      bool                         `json:"kroger_connected"`
	FitnessDataConnected bool                         `json:"fitness_data_connected"`
	ActivitySource       string                       `json:"activity_source"`
	ShoppingList         []string                     `json:"shopping_list"`
	ListTitle            string                       `json:"list_title"`
	Recipe               *grocery.RecipeDraft         `json:"recipe"`
	Cart                 []common.CartItem            `json:"cart"`
	ShoppingProfile      grocery.ShoppingProfileState `json:"shopping_profile"`
	WeeklyDeals          string                       `json:"weekly_deals"`
	Notes                string                       `json:"notes"`
	Activities           []fitness.Activity           `json:"activities"`
	ActivitiesSyncedAt   string                       `json:"activities_synced_at"`
	ObjectiveResearch    string                       `json:"objective_research"`
	TrainingPlan         string                       `json:"training_plan"`
}

func Defaults() WellnessState {
	return WellnessState{
		Status: StatusIdle, ShoppingList: []string{}, Cart: []common.CartItem{},
		ShoppingProfile: grocery.Defaults().ShoppingProfile, Activities: []fitness.Activity{},
	}
}

func StateDefaults() map[string]any {
	return agentruntime.StateMap(Defaults())
}

func readState(source session.ReadonlyState) WellnessState {
	state := agentruntime.ReadState(source, Defaults())
	if state.ShoppingList == nil {
		state.ShoppingList = []string{}
	}
	if state.Cart == nil {
		state.Cart = []common.CartItem{}
	}
	state.ShoppingProfile.Normalize()
	if state.Activities == nil {
		state.Activities = []fitness.Activity{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}
