package grocery

import (
	"encoding/json"

	"agents/internal/agentruntime"
	"agents/internal/common"
)

const AppName = "grocery_agent"

type Status string

const (
	StatusIdle     Status = "idle"
	StatusPlanning Status = "planning"
	StatusReady    Status = "ready"
)

type (
	CartItem   = common.CartItem
	PantryItem = common.PantryItem
)

type GroceryState struct {
	ShoppingList    []string     `json:"shopping_list"`
	MealPlan        string       `json:"meal_plan"`
	Cart            []CartItem   `json:"cart"`
	Pantry          []PantryItem `json:"pantry"`
	WeeklyDeals     string       `json:"weekly_deals"`
	WeeklyPlan      string       `json:"weekly_plan"`
	Status          Status       `json:"status"`
	Notes           string       `json:"notes"`
	ReviewSummary   string       `json:"review_summary"`
	KrogerConnected bool         `json:"kroger_connected"`
	TrainingPlan    string       `json:"training_plan"`
	UserID          string       `json:"user_id"`
}

func Defaults() GroceryState {
	return GroceryState{ShoppingList: []string{}, Cart: []CartItem{}, Pantry: []PantryItem{}, Status: StatusIdle}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func decodeState(tx *agentruntime.Transaction) GroceryState {
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
		state.Cart = []CartItem{}
	}
	if state.Pantry == nil {
		state.Pantry = []PantryItem{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}

func writeState(tx *agentruntime.Transaction, state GroceryState) {
	tx.Set("shopping_list", state.ShoppingList)
	tx.Set("meal_plan", state.MealPlan)
	tx.Set("cart", state.Cart)
	tx.Set("pantry", state.Pantry)
	tx.Set("weekly_deals", state.WeeklyDeals)
	tx.Set("weekly_plan", state.WeeklyPlan)
	tx.Set("status", state.Status)
	tx.Set("notes", state.Notes)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("kroger_connected", state.KrogerConnected)
	tx.Set("training_plan", state.TrainingPlan)
	tx.Set("user_id", state.UserID)
}
