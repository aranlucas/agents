package grocery

import (
	"errors"
	"strings"
	"time"

	"agents/internal/groceries"
	"google.golang.org/adk/v2/agent"
)

type SaveListArgs struct {
	HouseholdID *string `json:"household_id,omitempty" jsonschema:"Optional household id. Omit only when the user belongs to exactly one household."`
	Title       string  `json:"title" jsonschema:"Title for the new shared grocery list."`
}

type SharedLists struct {
	Repository groceries.Repository
	Now        func() time.Time
}

func (shared SharedLists) SaveListToHousehold(ctx agent.Context, input SaveListArgs) (Result, error) {
	if shared.Repository == nil {
		return Result{}, errors.New("shared grocery-list store is required")
	}
	userID := strings.TrimSpace(ctx.UserID())
	title := strings.TrimSpace(input.Title)
	state := readState(ctx.State())
	if userID == "" {
		return groceryFailure("authentication_required", "sign in before saving a shared list"), nil
	}
	if title == "" || len(title) > 120 {
		return groceryFailure("invalid_list_title", "a shared-list title is required within 120 characters"), nil
	}
	if state.Status != StatusReady || len(state.ShoppingList) == 0 {
		return groceryFailure("shopping_list_not_ready", "mark a non-empty shopping list ready before saving it"), nil
	}
	items := groceryListItems(state)
	if len(items) == 0 {
		return groceryFailure("shopping_list_not_ready", "mark a non-empty shopping list ready before saving it"), nil
	}
	for _, item := range items {
		if len(item.Name) > 500 || len(item.Quantity) > 100 {
			return groceryFailure("invalid_shared_list", "the shared list contains an item outside the allowed size"), nil
		}
	}

	householdID, result, err := shared.resolveHousehold(ctx, userID, input.HouseholdID)
	if err != nil || result.Error != nil {
		return result, err
	}
	now := time.Now()
	if shared.Now != nil {
		now = shared.Now()
	}
	list, err := shared.Repository.CreateList(ctx, userID, &householdID, title, now)
	if err != nil {
		if errors.Is(err, groceries.ErrInvalid) || errors.Is(err, groceries.ErrForbidden) || errors.Is(err, groceries.ErrNotFound) {
			return sharedListStoreFailure(err), nil
		}
		return Result{}, err
	}
	if _, err := shared.Repository.AddItems(ctx, userID, list.ID, items, now); err != nil {
		if errors.Is(err, groceries.ErrInvalid) || errors.Is(err, groceries.ErrForbidden) || errors.Is(err, groceries.ErrNotFound) {
			return sharedListStoreFailure(err), nil
		}
		return Result{}, err
	}
	return Result{OK: true, Count: len(items), ListID: list.ID, HouseholdID: householdID}, nil
}

func (shared SharedLists) resolveHousehold(ctx agent.Context, userID string, requested *string) (string, Result, error) {
	if requested != nil && strings.TrimSpace(*requested) != "" {
		householdID := strings.TrimSpace(*requested)
		member, err := shared.Repository.IsMember(ctx, userID, householdID)
		if err != nil {
			return "", Result{}, err
		}
		if !member {
			return "", groceryFailure("household_forbidden", "you are not a member of that household"), nil
		}
		return householdID, Result{}, nil
	}

	households, err := shared.Repository.ListHouseholds(ctx, userID)
	if err != nil {
		return "", Result{}, err
	}
	switch len(households) {
	case 1:
		return households[0].ID, Result{}, nil
	case 0:
		return "", groceryFailure("household_required", "create or join a household before saving a shared list"), nil
	default:
		return "", groceryFailure("household_id_required", "choose which household should receive this list"), nil
	}
}

func groceryListItems(state GroceryState) []groceries.NewItem {
	matches := make(map[string]ProductMatch, len(state.ProductMatches))
	for _, match := range state.ProductMatches {
		query := strings.ToLower(strings.TrimSpace(match.Query))
		if query != "" {
			matches[query] = match
		}
	}
	items := make([]groceries.NewItem, 0, len(state.ShoppingList))
	for _, raw := range state.ShoppingList {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		quantity := "1"
		if match, ok := matches[strings.ToLower(name)]; ok && strings.TrimSpace(match.Size) != "" {
			quantity = strings.TrimSpace(match.Size)
		}
		items = append(items, groceries.NewItem{Name: name, Quantity: quantity})
	}
	return items
}

func sharedListStoreFailure(err error) Result {
	switch {
	case errors.Is(err, groceries.ErrForbidden):
		return groceryFailure("household_forbidden", "you are not allowed to update that household")
	case errors.Is(err, groceries.ErrNotFound):
		return groceryFailure("shared_list_not_found", "the shared list no longer exists")
	default:
		return groceryFailure("invalid_shared_list", "the shared list could not be saved with those values")
	}
}
