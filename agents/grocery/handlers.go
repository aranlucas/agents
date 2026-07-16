package grocery

import (
	"errors"
	"math"
	"net/url"
	"regexp"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
)

var (
	ErrKrogerDisconnected = errors.New("Kroger is not connected")
	upcPattern            = regexp.MustCompile(`^[0-9]{6,20}$`)
)

const maxGroceryDocument = 1 << 20

type Result struct {
	OK          bool                          `json:"ok"`
	Count       int                           `json:"count,omitempty"`
	Length      int                           `json:"length,omitempty"`
	Date        string                        `json:"date,omitempty"`
	Weekday     string                        `json:"weekday,omitempty"`
	Month       string                        `json:"month,omitempty"`
	ListID      string                        `json:"list_id,omitempty"`
	HouseholdID string                        `json:"household_id,omitempty"`
	Error       *agentruntime.StructuredError `json:"error,omitempty"`
}

type ShoppingListArgs struct {
	Items []string `json:"items" jsonschema:"The complete shopping list. Always provide a JSON array of strings; use an empty array when there are no items."`
}

type ProductMatchesArgs struct {
	Items []ProductMatch `json:"items" jsonschema:"Selected live Kroger product matches from the latest search_products result. Copy query, name, upc, image_url, price, and size exactly; use an empty array when there are no matches."`
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

func SetShoppingList(ctx agent.Context, input ShoppingListArgs) (Result, error) {
	if err := ctx.State().Set("shopping_list", input.Items); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("product_matches", []ProductMatch{}); err != nil {
		return Result{}, err
	}
	return Result{OK: true, Count: len(input.Items)}, nil
}

func SetProductMatches(ctx agent.Context, input ProductMatchesArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setProductMatches(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("product_matches", state.ProductMatches); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setProductMatches(state *GroceryState, input ProductMatchesArgs) (Result, error) {
	if !state.KrogerConnected {
		return Result{}, ErrKrogerDisconnected
	}
	if len(input.Items) > 100 {
		return groceryFailure("product_matches_too_large", "product matches cannot exceed 100 items"), nil
	}
	for _, item := range input.Items {
		if strings.TrimSpace(item.Query) == "" || len(item.Query) > 100 || strings.TrimSpace(item.Name) == "" || len(item.Name) > 500 || !upcPattern.MatchString(item.UPC) || math.IsNaN(item.Price) || math.IsInf(item.Price, 0) || item.Price < 0 || item.Price > 1_000_000 || len(item.Size) > 100 || !validKrogerImageURL(item.ImageURL) {
			return groceryFailure("invalid_product_match", "product match query, name, UPC, image URL, price, or size is invalid"), nil
		}
	}
	state.ProductMatches = append([]ProductMatch(nil), input.Items...)
	return Result{OK: true, Count: len(input.Items)}, nil
}

func validKrogerImageURL(raw string) bool {
	if raw == "" {
		return true
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "kroger.com" || strings.HasSuffix(host, ".kroger.com")
}

func UpdateCart(ctx agent.Context, input CartArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := updateCart(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("cart", state.Cart); err != nil {
		return Result{}, err
	}
	return result, nil
}

func updateCart(state *GroceryState, input CartArgs) (Result, error) {
	if !state.KrogerConnected {
		return Result{}, ErrKrogerDisconnected
	}
	if err := validateCart(input.Items); err != nil {
		return groceryFailure("invalid_cart", err.Error()), nil
	}
	state.Cart = append([]CartItem(nil), input.Items...)
	return Result{OK: true, Count: len(input.Items)}, nil
}

func UpdatePantry(ctx agent.Context, input PantryArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := updatePantry(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("pantry", state.Pantry); err != nil {
		return Result{}, err
	}
	return result, nil
}

func updatePantry(state *GroceryState, input PantryArgs) (Result, error) {
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
	state.Pantry = append([]PantryItem(nil), input.Items...)
	return Result{OK: true, Count: len(input.Items)}, nil
}

func SetMealPlan(ctx agent.Context, input MealPlanArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setMealPlan(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("meal_plan", state.MealPlan); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setMealPlan(state *GroceryState, input MealPlanArgs) (Result, error) {
	if len(input.Plan) > maxGroceryDocument {
		return groceryFailure("meal_plan_too_large", "meal plan exceeds the allowed size"), nil
	}
	state.MealPlan, state.Status = input.Plan, StatusPlanning
	return Result{OK: true, Length: len(input.Plan)}, nil
}

func SetWeeklyDeals(ctx agent.Context, input DealsArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setWeeklyDeals(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("weekly_deals", state.WeeklyDeals); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setWeeklyDeals(state *GroceryState, input DealsArgs) (Result, error) {
	if len(input.Deals) > maxGroceryDocument {
		return groceryFailure("deals_too_large", "weekly deals exceed the allowed size"), nil
	}
	state.WeeklyDeals = input.Deals
	return Result{OK: true, Length: len(input.Deals)}, nil
}

func MarkListReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markListReady(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func markListReady(state *GroceryState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return groceryFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if len(state.ShoppingList) == 0 {
		return groceryFailure("shopping_list_required", "a shopping list is required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, strings.TrimSpace(input.Summary)
	return Result{OK: true}, nil
}

func GetCurrentDate(_ agent.Context, _ CurrentDateArgs) (Result, error) {
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
