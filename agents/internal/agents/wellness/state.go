package wellness

import (
	"encoding/json"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
	"github.com/aranlucas/agents/agents/internal/agents/fitness"
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
	Status             Status              `json:"status"`
	MealPlan           string              `json:"meal_plan"`
	WeeklyPlan         string              `json:"weekly_plan"`
	ReviewSummary      string              `json:"review_summary"`
	UserID             string              `json:"user_id"`
	KrogerConnected    bool                `json:"kroger_connected"`
	StravaConnected    bool                `json:"strava_connected"`
	ShoppingList       []string            `json:"shopping_list"`
	Cart               []common.CartItem   `json:"cart"`
	Pantry             []common.PantryItem `json:"pantry"`
	WeeklyDeals        string              `json:"weekly_deals"`
	Notes              string              `json:"notes"`
	Activities         []fitness.Activity  `json:"activities"`
	ActivitiesSyncedAt string              `json:"activities_synced_at"`
	ObjectiveResearch  string              `json:"objective_research"`
	TrainingPlan       string              `json:"training_plan"`
}

func Defaults() WellnessState {
	return WellnessState{Status: StatusIdle, ShoppingList: []string{}, Cart: []common.CartItem{}, Pantry: []common.PantryItem{}, Activities: []fitness.Activity{}}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func decodeState(tx *agentruntime.Transaction) WellnessState {
	state := Defaults()
	if tx != nil {
		if encoded, err := json.Marshal(tx.Snapshot()); err == nil {
			_ = json.Unmarshal(encoded, &state)
		}
	}
	if state.ShoppingList == nil {
		state.ShoppingList = []string{}
	}
	if state.Cart == nil {
		state.Cart = []common.CartItem{}
	}
	if state.Pantry == nil {
		state.Pantry = []common.PantryItem{}
	}
	if state.Activities == nil {
		state.Activities = []fitness.Activity{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}

func writeState(tx *agentruntime.Transaction, state WellnessState) {
	tx.Set("status", state.Status)
	tx.Set("meal_plan", state.MealPlan)
	tx.Set("weekly_plan", state.WeeklyPlan)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
	tx.Set("kroger_connected", state.KrogerConnected)
	tx.Set("strava_connected", state.StravaConnected)
	tx.Set("shopping_list", state.ShoppingList)
	tx.Set("cart", state.Cart)
	tx.Set("pantry", state.Pantry)
	tx.Set("weekly_deals", state.WeeklyDeals)
	tx.Set("notes", state.Notes)
	tx.Set("activities", state.Activities)
	tx.Set("activities_synced_at", state.ActivitiesSyncedAt)
	tx.Set("objective_research", state.ObjectiveResearch)
	tx.Set("training_plan", state.TrainingPlan)
}
