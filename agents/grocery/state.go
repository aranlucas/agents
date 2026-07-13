package grocery

import (
	"encoding/json"

	"agents/internal/common"
	"google.golang.org/adk/v2/session"
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

func readState(source session.ReadonlyState) GroceryState {
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
