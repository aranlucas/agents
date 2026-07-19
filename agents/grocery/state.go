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
	CartItem     = common.CartItem
	ProductMatch = common.ProductMatch
	PantryItem   = common.PantryItem
)

type GroceryState struct {
	ShoppingList    []string             `json:"shopping_list"`
	ListTitle       string               `json:"list_title"`
	ProductMatches  []ProductMatch       `json:"product_matches"`
	MealPlan        string               `json:"meal_plan"`
	Recipe          *RecipeDraft         `json:"recipe"`
	Cart            []CartItem           `json:"cart"`
	Pantry          []PantryItem         `json:"pantry"`
	ShoppingProfile ShoppingProfileState `json:"shopping_profile"`
	WeeklyDeals     string               `json:"weekly_deals"`
	WeeklyPlan      string               `json:"weekly_plan"`
	Status          Status               `json:"status"`
	Notes           string               `json:"notes"`
	ReviewSummary   string               `json:"review_summary"`
	KrogerConnected bool                 `json:"kroger_connected"`
	TrainingPlan    string               `json:"training_plan"`
}

// ShoppingProfileState is the durable shopping profile projected into ADK
// session state. Pantry remains separately projected through GroceryState.Pantry
// with its legacy string quantity shape for existing clients.
type ShoppingProfileState struct {
	PreferredStore *ShoppingPreferredStoreState `json:"preferred_store,omitempty"`
	Pantry         []ShoppingPantryItemState    `json:"pantry"`
	Equipment      []ShoppingEquipmentItemState `json:"equipment"`
	RecentOrders   []ShoppingOrderState         `json:"recent_orders"`
	FrequentItems  []ShoppingFrequentItemState  `json:"frequent_items"`
}

type ShoppingPantryItemState struct {
	Name      string  `json:"name"`
	Quantity  float64 `json:"quantity"`
	AddedAt   int64   `json:"added_at"`
	ExpiresAt *int64  `json:"expires_at,omitempty"`
}

type ShoppingEquipmentItemState struct {
	Name     string  `json:"name"`
	Category *string `json:"category,omitempty"`
	AddedAt  int64   `json:"added_at"`
}

type ShoppingOrderItemState struct {
	UPC      string   `json:"upc"`
	Name     string   `json:"name"`
	Quantity int      `json:"quantity"`
	Price    *float64 `json:"price,omitempty"`
}

type ShoppingOrderState struct {
	ID             string                   `json:"id"`
	Items          []ShoppingOrderItemState `json:"items"`
	TotalItems     int                      `json:"total_items"`
	EstimatedTotal *float64                 `json:"estimated_total,omitempty"`
	PlacedAt       int64                    `json:"placed_at"`
	LocationID     *string                  `json:"location_id,omitempty"`
	Notes          *string                  `json:"notes,omitempty"`
}

type ShoppingPreferredStoreState struct {
	LocationID string `json:"location_id"`
	Name       string `json:"name"`
	Address    string `json:"address"`
	Chain      string `json:"chain"`
	SetAt      int64  `json:"set_at"`
}

type ShoppingFrequentItemState struct {
	Name          string `json:"name"`
	UPC           string `json:"upc"`
	Orders        int    `json:"orders"`
	TotalQuantity int    `json:"total_quantity"`
}

type RecipeDraft struct {
	Title       string                  `json:"title"`
	Description string                  `json:"description"`
	Servings    string                  `json:"servings"`
	Notes       string                  `json:"notes"`
	Ingredients []RecipeDraftIngredient `json:"ingredients"`
	Steps       []string                `json:"steps"`
	Tags        []string                `json:"tags"`
}

type RecipeDraftIngredient struct {
	Name     string `json:"name"`
	Quantity string `json:"quantity"`
	Unit     string `json:"unit"`
	Note     string `json:"note"`
}

func Defaults() GroceryState {
	return GroceryState{
		ShoppingList: []string{}, ProductMatches: []ProductMatch{}, Cart: []CartItem{}, Pantry: []PantryItem{},
		ShoppingProfile: emptyShoppingProfileState(), Status: StatusIdle,
	}
}

func emptyShoppingProfileState() ShoppingProfileState {
	return ShoppingProfileState{
		Pantry: []ShoppingPantryItemState{}, Equipment: []ShoppingEquipmentItemState{},
		RecentOrders: []ShoppingOrderState{}, FrequentItems: []ShoppingFrequentItemState{},
	}
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
	if state.ProductMatches == nil {
		state.ProductMatches = []ProductMatch{}
	}
	if state.Cart == nil {
		state.Cart = []CartItem{}
	}
	if state.Pantry == nil {
		state.Pantry = []PantryItem{}
	}
	if state.ShoppingProfile.Pantry == nil {
		state.ShoppingProfile.Pantry = []ShoppingPantryItemState{}
	}
	if state.ShoppingProfile.Equipment == nil {
		state.ShoppingProfile.Equipment = []ShoppingEquipmentItemState{}
	}
	if state.ShoppingProfile.RecentOrders == nil {
		state.ShoppingProfile.RecentOrders = []ShoppingOrderState{}
	}
	for index := range state.ShoppingProfile.RecentOrders {
		if state.ShoppingProfile.RecentOrders[index].Items == nil {
			state.ShoppingProfile.RecentOrders[index].Items = []ShoppingOrderItemState{}
		}
	}
	if state.ShoppingProfile.FrequentItems == nil {
		state.ShoppingProfile.FrequentItems = []ShoppingFrequentItemState{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	if state.Recipe != nil {
		if state.Recipe.Ingredients == nil {
			state.Recipe.Ingredients = []RecipeDraftIngredient{}
		}
		if state.Recipe.Steps == nil {
			state.Recipe.Steps = []string{}
		}
		if state.Recipe.Tags == nil {
			state.Recipe.Tags = []string{}
		}
	}
	return state
}
