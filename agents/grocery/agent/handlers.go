package grocery

import (
	"context"
	"errors"
	"math"
	"regexp"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/common"
)

var (
	ErrKrogerDisconnected = errors.New("Kroger is not connected")
	upcPattern            = regexp.MustCompile(`^[0-9]{6,20}$`)
)

const maxGroceryDocument = 1 << 20

type Result struct {
	OK      bool                          `json:"ok"`
	Count   int                           `json:"count,omitempty"`
	Length  int                           `json:"length,omitempty"`
	Date    string                        `json:"date,omitempty"`
	Weekday string                        `json:"weekday,omitempty"`
	Month   string                        `json:"month,omitempty"`
	Error   *agentruntime.StructuredError `json:"error,omitempty"`
}

type ShoppingListArgs struct {
	Items []string `json:"items"`
	Notes string   `json:"notes"`
}
type CartArgs struct {
	Items []CartItem `json:"items"`
}
type PantryArgs struct {
	Items []PantryItem `json:"items"`
}
type MealPlanArgs struct {
	Plan string `json:"plan"`
}
type DealsArgs struct {
	Deals string `json:"deals"`
}
type ReadyArgs struct {
	Summary string `json:"summary"`
}
type CurrentDateArgs struct{}

func SetShoppingList(_ context.Context, tx *agentruntime.Transaction, input ShoppingListArgs) (Result, error) {
	if len(input.Items) > 500 || len(input.Notes) > 100_000 {
		return groceryFailure("shopping_list_too_large", "shopping list or notes exceeds the allowed size"), nil
	}
	items := make([]string, 0, len(input.Items))
	for _, item := range input.Items {
		item = strings.TrimSpace(item)
		if item == "" || len(item) > 500 {
			return groceryFailure("invalid_shopping_item", "shopping items must be non-empty and at most 500 characters"), nil
		}
		items = append(items, item)
	}
	state := decodeState(tx)
	state.ShoppingList, state.Status = items, StatusPlanning
	if input.Notes != "" {
		state.Notes = input.Notes
	}
	writeState(tx, state)
	return Result{OK: true, Count: len(items)}, nil
}

func UpdateCart(_ context.Context, tx *agentruntime.Transaction, input CartArgs) (Result, error) {
	state := decodeState(tx)
	if !state.KrogerConnected {
		return Result{}, ErrKrogerDisconnected
	}
	if err := validateCart(input.Items); err != nil {
		return groceryFailure("invalid_cart", err.Error()), nil
	}
	state.Cart = append([]CartItem(nil), input.Items...)
	writeState(tx, state)
	return Result{OK: true, Count: len(input.Items)}, nil
}

func UpdatePantry(_ context.Context, tx *agentruntime.Transaction, input PantryArgs) (Result, error) {
	if len(input.Items) > 500 {
		return groceryFailure("pantry_too_large", "pantry cannot exceed 500 items"), nil
	}
	for _, item := range input.Items {
		if strings.TrimSpace(item.Name) == "" || len(item.Name) > 500 || strings.TrimSpace(item.Quantity) == "" || len(item.Quantity) > 100 {
			return groceryFailure("invalid_pantry_item", "pantry item name and quantity are required within bounds"), nil
		}
		if item.Expires != nil {
			if _, err := time.Parse(time.DateOnly, *item.Expires); err != nil {
				return groceryFailure("invalid_expiry", "pantry expiry must use YYYY-MM-DD"), nil
			}
		}
	}
	state := decodeState(tx)
	state.Pantry = append([]PantryItem(nil), input.Items...)
	writeState(tx, state)
	return Result{OK: true, Count: len(input.Items)}, nil
}

func SetMealPlan(_ context.Context, tx *agentruntime.Transaction, input MealPlanArgs) (Result, error) {
	if len(input.Plan) > maxGroceryDocument {
		return groceryFailure("meal_plan_too_large", "meal plan exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	state.MealPlan, state.Status = input.Plan, StatusPlanning
	writeState(tx, state)
	return Result{OK: true, Length: len(input.Plan)}, nil
}

func SetWeeklyDeals(_ context.Context, tx *agentruntime.Transaction, input DealsArgs) (Result, error) {
	if len(input.Deals) > maxGroceryDocument {
		return groceryFailure("deals_too_large", "weekly deals exceed the allowed size"), nil
	}
	state := decodeState(tx)
	state.WeeklyDeals = input.Deals
	writeState(tx, state)
	return Result{OK: true, Length: len(input.Deals)}, nil
}

func MarkListReady(_ context.Context, tx *agentruntime.Transaction, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return groceryFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	if len(state.ShoppingList) == 0 {
		return groceryFailure("shopping_list_required", "a shopping list is required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, strings.TrimSpace(input.Summary)
	writeState(tx, state)
	return Result{OK: true}, nil
}

func GetCurrentDate(_ context.Context, _ *agentruntime.Transaction, _ CurrentDateArgs) (Result, error) {
	date := common.DateDetails(nil)
	return Result{OK: true, Date: date.Date, Weekday: date.Weekday, Month: date.Month}, nil
}

func validateCart(items []CartItem) error {
	if len(items) > 500 {
		return errors.New("cart cannot exceed 500 items")
	}
	for _, item := range items {
		if strings.TrimSpace(item.Name) == "" || len(item.Name) > 500 || item.Quantity < 1 || item.Quantity > 1000 || math.IsNaN(item.Price) || math.IsInf(item.Price, 0) || item.Price < 0 || item.Price > 1_000_000 || !upcPattern.MatchString(item.UPC) {
			return errors.New("cart item name, quantity, price, or UPC is invalid")
		}
	}
	return nil
}

func groceryFailure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
