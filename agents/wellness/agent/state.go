package wellness

import (
	"encoding/json"
	"fmt"

	"agents/fitness/agent"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
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
	Status               Status              `json:"status"`
	MealPlan             string              `json:"meal_plan"`
	WeeklyPlan           string              `json:"weekly_plan"`
	ReviewSummary        string              `json:"review_summary"`
	UserID               string              `json:"user_id"`
	KrogerConnected      bool                `json:"kroger_connected"`
	FitnessDataConnected bool                `json:"fitness_data_connected"`
	ActivitySource       string              `json:"activity_source"`
	ShoppingList         []string            `json:"shopping_list"`
	Cart                 []common.CartItem   `json:"cart"`
	Pantry               []common.PantryItem `json:"pantry"`
	WeeklyDeals          string              `json:"weekly_deals"`
	Notes                string              `json:"notes"`
	Activities           []fitness.Activity  `json:"activities"`
	ActivitiesSyncedAt   string              `json:"activities_synced_at"`
	ObjectiveResearch    string              `json:"objective_research"`
	TrainingPlan         string              `json:"training_plan"`
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

func readState(source session.ReadonlyState) WellnessState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		for key, value := range source.All() {
			values[key] = value
		}
		if encoded, err := json.Marshal(values); err == nil {
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

func publishState(ctx agent.Context, state WellnessState) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"status", state.Status},
		{"meal_plan", state.MealPlan},
		{"weekly_plan", state.WeeklyPlan},
		{"review_summary", state.ReviewSummary},
		{"user_id", state.UserID},
		{"kroger_connected", state.KrogerConnected},
		{"fitness_data_connected", state.FitnessDataConnected},
		{"activity_source", state.ActivitySource},
		{"shopping_list", state.ShoppingList},
		{"cart", state.Cart},
		{"pantry", state.Pantry},
		{"weekly_deals", state.WeeklyDeals},
		{"notes", state.Notes},
		{"activities", state.Activities},
		{"activities_synced_at", state.ActivitiesSyncedAt},
		{"objective_research", state.ObjectiveResearch},
		{"training_plan", state.TrainingPlan},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}
