package grocery

import (
	"errors"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/groceries"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// PantryItemInput is the model-facing representation of one pantry item.
// Quantity defaults to one when omitted. Pantry names are merged by the
// repository case-insensitively.
type PantryItemInput struct {
	Name      string   `json:"name" jsonschema:"Pantry item name."`
	Quantity  *float64 `json:"quantity,omitempty" jsonschema:"Defaults to 1."`
	ExpiresAt *string  `json:"expires_at,omitempty" jsonschema:"RFC3339 date, optional."`
}

// AddPantryArgs is the model-facing input for add_to_pantry. PantryArgs is
// already used by the state-only update_pantry tool, so this distinct Go name
// preserves that existing API while keeping the native JSON contract exact.
type AddPantryArgs struct {
	Items []PantryItemInput `json:"items" jsonschema:"Pantry items to add; duplicate names merge case-insensitively."`
}

type RemovePantryArgs struct {
	Names []string `json:"names,omitempty" jsonschema:"Pantry item names to remove, matched case-insensitively."`
	All   bool     `json:"all,omitempty" jsonschema:"Clear the entire pantry instead of removing named items."`
}

type EquipmentItemInput struct {
	Name     string  `json:"name" jsonschema:"Kitchen equipment name."`
	Category *string `json:"category,omitempty" jsonschema:"Optional equipment category."`
}

type EquipmentArgs struct {
	Items []EquipmentItemInput `json:"items" jsonschema:"Equipment items to add; duplicate names merge case-insensitively."`
}

type RemoveEquipmentArgs struct {
	Names []string `json:"names,omitempty" jsonschema:"Equipment names to remove, matched case-insensitively."`
	All   bool     `json:"all,omitempty" jsonschema:"Clear all kitchen equipment instead of removing named items."`
}

type RecentOrdersArgs struct {
	Limit int `json:"limit,omitempty" jsonschema:"Maximum number of recent orders; defaults to 10 and is capped at 50."`
}

type RecordOrderArgs struct {
	ID             string                `json:"id,omitempty" jsonschema:"Optional idempotency/order id."`
	Items          []groceries.OrderItem `json:"items" jsonschema:"Items that were actually purchased in the completed order."`
	EstimatedTotal *float64              `json:"estimated_total,omitempty" jsonschema:"Optional total paid or estimated total."`
	PlacedAt       int64                 `json:"placed_at,omitempty" jsonschema:"Optional Unix timestamp; defaults to now."`
	LocationID     *string               `json:"location_id,omitempty" jsonschema:"Optional preferred-store location id."`
	Notes          *string               `json:"notes,omitempty" jsonschema:"Optional order notes."`
}

type PreferredStoreArgs struct {
	LocationID string `json:"location_id" jsonschema:"Store location id from search_stores."`
	Name       string `json:"name" jsonschema:"Store name from get_store."`
	Address    string `json:"address" jsonschema:"Store address from get_store."`
	Chain      string `json:"chain" jsonschema:"Store chain from get_store."`
}

type PantryResult struct {
	Items []groceries.PantryItem        `json:"items,omitempty"`
	Error *agentruntime.StructuredError `json:"error,omitempty"`
}

type EquipmentResult struct {
	Items []groceries.EquipmentItem     `json:"items,omitempty"`
	Error *agentruntime.StructuredError `json:"error,omitempty"`
}

type OrdersResult struct {
	Orders []groceries.Order             `json:"orders,omitempty"`
	Order  *groceries.Order              `json:"order,omitempty"`
	Error  *agentruntime.StructuredError `json:"error,omitempty"`
}

type PreferredStoreResult struct {
	Store *groceries.PreferredStore     `json:"store,omitempty"`
	Error *agentruntime.StructuredError `json:"error,omitempty"`
}

type ShoppingProfileResult struct {
	Profile *groceries.ShoppingProfile    `json:"profile,omitempty"`
	Error   *agentruntime.StructuredError `json:"error,omitempty"`
}

// ShoppingResources adapts the D1-backed repository to native ADK tools.
// Keeping the clock here mirrors SavedResources and makes tool behavior
// deterministic in tests without putting time concerns in the repository
// interface.
type ShoppingResources struct {
	Repository groceries.ShoppingRepository
	Now        func() time.Time
}

func shoppingResourceTools(repository groceries.ShoppingRepository) ([]tool.Tool, error) {
	if repository == nil {
		return nil, errors.New("grocery shopping repository is required")
	}
	shopping := ShoppingResources{Repository: repository}
	definitions := []struct {
		name        string
		description string
		build       func() (tool.Tool, error)
	}{
		{name: "get_shopping_profile", description: "Read the signed-in user's preferred store, pantry, equipment, and recent order profile.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_shopping_profile", Description: "Read the signed-in user's preferred store, pantry, equipment, and recent order profile."}, shopping.GetShoppingProfile)
		}},
		{name: "add_to_pantry", description: "Add pantry items, merging duplicate names case-insensitively.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "add_to_pantry", Description: "Add pantry items, merging duplicate names case-insensitively."}, shopping.AddToPantry)
		}},
		{name: "remove_from_pantry", description: "Remove named pantry items, matching names case-insensitively.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "remove_from_pantry", Description: "Remove named pantry items, matching names case-insensitively."}, shopping.RemoveFromPantry)
		}},
		{name: "add_equipment", description: "Add kitchen equipment, merging duplicate names case-insensitively.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "add_equipment", Description: "Add kitchen equipment, merging duplicate names case-insensitively."}, shopping.AddEquipment)
		}},
		{name: "remove_equipment", description: "Remove named kitchen equipment, matching names case-insensitively.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "remove_equipment", Description: "Remove named kitchen equipment, matching names case-insensitively."}, shopping.RemoveEquipment)
		}},
		{name: "get_recent_orders", description: "List the signed-in user's recently recorded completed orders.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_recent_orders", Description: "List the signed-in user's recently recorded completed orders."}, shopping.GetRecentOrders)
		}},
		{name: "record_order", description: "Record items from a completed order for future shopping context; this does not place an order.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "record_order", Description: "Record items from a completed order for future shopping context; this does not place an order."}, shopping.RecordOrder)
		}},
		{name: "get_preferred_store", description: "Read the signed-in user's saved preferred store.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_preferred_store", Description: "Read the signed-in user's saved preferred store."}, shopping.GetPreferredStore)
		}},
		{name: "set_preferred_store", description: "Save the selected Kroger store as the signed-in user's preferred store.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "set_preferred_store", Description: "Save the selected Kroger store as the signed-in user's preferred store."}, shopping.SetPreferredStore)
		}},
	}
	tools := make([]tool.Tool, 0, len(definitions))
	for _, definition := range definitions {
		built, err := definition.build()
		if err != nil {
			return nil, err
		}
		tools = append(tools, built)
	}
	return tools, nil
}

func (shopping ShoppingResources) currentTime() time.Time {
	if shopping.Now != nil {
		return shopping.Now()
	}
	return time.Now()
}

func (shopping ShoppingResources) GetShoppingProfile(ctx agent.Context, _ struct{}) (ShoppingProfileResult, error) {
	profile, err := shopping.refreshShoppingProfileState(ctx)
	if err != nil {
		return ShoppingProfileResult{Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return ShoppingProfileResult{Profile: &profile}, nil
}

func (shopping ShoppingResources) AddToPantry(ctx agent.Context, input AddPantryArgs) (PantryResult, error) {
	items := make([]groceries.PantryItem, 0, len(input.Items))
	for _, item := range input.Items {
		quantity := float64(1)
		if item.Quantity != nil {
			quantity = *item.Quantity
		}
		expiresAt, err := parseShoppingDate(item.ExpiresAt)
		if err != nil {
			return PantryResult{Error: &agentruntime.StructuredError{Code: "invalid_pantry_item", Message: "expires_at must be an RFC3339 timestamp"}}, nil
		}
		items = append(items, groceries.PantryItem{Name: item.Name, Quantity: quantity, ExpiresAt: expiresAt})
	}
	pantry, err := shopping.Repository.AddPantryItems(ctx, strings.TrimSpace(ctx.UserID()), items, shopping.currentTime())
	if err != nil {
		return PantryResult{Error: shoppingFailure("pantry", err)}, nil
	}
	if err := writeShoppingPantryState(ctx, pantry); err != nil {
		return PantryResult{Items: pantry, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return PantryResult{Items: pantry}, nil
}

func (shopping ShoppingResources) RemoveFromPantry(ctx agent.Context, input RemovePantryArgs) (PantryResult, error) {
	if input.All {
		if err := shopping.Repository.ClearPantry(ctx, strings.TrimSpace(ctx.UserID())); err != nil {
			return PantryResult{Error: shoppingFailure("pantry", err)}, nil
		}
		if err := writeShoppingPantryState(ctx, []groceries.PantryItem{}); err != nil {
			return PantryResult{Items: []groceries.PantryItem{}, Error: shoppingFailure("shopping_profile", err)}, nil
		}
		return PantryResult{Items: []groceries.PantryItem{}}, nil
	}
	pantry, err := shopping.Repository.RemovePantryItems(ctx, strings.TrimSpace(ctx.UserID()), input.Names)
	if err != nil {
		return PantryResult{Error: shoppingFailure("pantry", err)}, nil
	}
	if err := writeShoppingPantryState(ctx, pantry); err != nil {
		return PantryResult{Items: pantry, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return PantryResult{Items: pantry}, nil
}

func (shopping ShoppingResources) AddEquipment(ctx agent.Context, input EquipmentArgs) (EquipmentResult, error) {
	items := make([]groceries.EquipmentItem, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, groceries.EquipmentItem{Name: item.Name, Category: item.Category})
	}
	equipment, err := shopping.Repository.AddEquipment(ctx, strings.TrimSpace(ctx.UserID()), items, shopping.currentTime())
	if err != nil {
		return EquipmentResult{Error: shoppingFailure("equipment", err)}, nil
	}
	if err := writeShoppingEquipmentState(ctx, equipment); err != nil {
		return EquipmentResult{Items: equipment, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return EquipmentResult{Items: equipment}, nil
}

func (shopping ShoppingResources) RemoveEquipment(ctx agent.Context, input RemoveEquipmentArgs) (EquipmentResult, error) {
	if input.All {
		if err := shopping.Repository.ClearEquipment(ctx, strings.TrimSpace(ctx.UserID())); err != nil {
			return EquipmentResult{Error: shoppingFailure("equipment", err)}, nil
		}
		if err := writeShoppingEquipmentState(ctx, []groceries.EquipmentItem{}); err != nil {
			return EquipmentResult{Items: []groceries.EquipmentItem{}, Error: shoppingFailure("shopping_profile", err)}, nil
		}
		return EquipmentResult{Items: []groceries.EquipmentItem{}}, nil
	}
	equipment, err := shopping.Repository.RemoveEquipment(ctx, strings.TrimSpace(ctx.UserID()), input.Names)
	if err != nil {
		return EquipmentResult{Error: shoppingFailure("equipment", err)}, nil
	}
	if err := writeShoppingEquipmentState(ctx, equipment); err != nil {
		return EquipmentResult{Items: equipment, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return EquipmentResult{Items: equipment}, nil
}

func (shopping ShoppingResources) GetRecentOrders(ctx agent.Context, input RecentOrdersArgs) (OrdersResult, error) {
	orders, err := shopping.Repository.RecentOrders(ctx, strings.TrimSpace(ctx.UserID()), input.Limit)
	if err != nil {
		return OrdersResult{Error: shoppingFailure("orders", err)}, nil
	}
	if err := writeShoppingOrdersState(ctx, orders); err != nil {
		return OrdersResult{Orders: orders, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return OrdersResult{Orders: orders}, nil
}

func (shopping ShoppingResources) RecordOrder(ctx agent.Context, input RecordOrderArgs) (OrdersResult, error) {
	estimatedTotal := input.EstimatedTotal
	if estimatedTotal == nil {
		var total float64
		for _, item := range input.Items {
			if item.Price != nil && *item.Price >= 0 {
				total += *item.Price * float64(item.Quantity)
			}
		}
		if total > 0 {
			estimatedTotal = &total
		}
	}
	order, err := shopping.Repository.RecordOrder(ctx, strings.TrimSpace(ctx.UserID()), groceries.Order{
		ID: input.ID, Items: input.Items, EstimatedTotal: estimatedTotal, PlacedAt: input.PlacedAt, LocationID: input.LocationID, Notes: input.Notes,
	}, shopping.currentTime())
	if err != nil {
		return OrdersResult{Error: shoppingFailure("orders", err)}, nil
	}
	if _, err := shopping.refreshShoppingProfileState(ctx); err != nil {
		return OrdersResult{Order: &order, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return OrdersResult{Order: &order}, nil
}

func (shopping ShoppingResources) GetPreferredStore(ctx agent.Context, _ struct{}) (PreferredStoreResult, error) {
	store, err := shopping.Repository.PreferredStore(ctx, strings.TrimSpace(ctx.UserID()))
	if err != nil {
		return PreferredStoreResult{Error: shoppingFailure("preferred_store", err)}, nil
	}
	if err := writeShoppingPreferredStoreState(ctx, store); err != nil {
		return PreferredStoreResult{Store: store, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return PreferredStoreResult{Store: store}, nil
}

func (shopping ShoppingResources) SetPreferredStore(ctx agent.Context, input PreferredStoreArgs) (PreferredStoreResult, error) {
	store := groceries.PreferredStore{
		LocationID: strings.TrimSpace(input.LocationID),
		Name:       strings.TrimSpace(input.Name),
		Address:    strings.TrimSpace(input.Address),
		Chain:      strings.TrimSpace(input.Chain),
	}
	now := shopping.currentTime()
	store.SetAt = now.Unix()
	canonical, err := shopping.Repository.SetPreferredStore(ctx, strings.TrimSpace(ctx.UserID()), store, now)
	if err != nil {
		return PreferredStoreResult{Error: shoppingFailure("preferred_store", err)}, nil
	}
	if err := writeShoppingPreferredStoreState(ctx, &canonical); err != nil {
		return PreferredStoreResult{Store: &canonical, Error: shoppingFailure("shopping_profile", err)}, nil
	}
	return PreferredStoreResult{Store: &canonical}, nil
}

func parseShoppingDate(value *string) (*int64, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*value))
	if err != nil {
		return nil, err
	}
	seconds := parsed.Unix()
	return &seconds, nil
}

func shoppingFailure(scope string, err error) *agentruntime.StructuredError {
	code := scope + "_unavailable"
	message := "shopping data is unavailable"
	if errors.Is(err, groceries.ErrInvalid) {
		code, message = "invalid_shopping_request", "shopping values are invalid"
	}
	return &agentruntime.StructuredError{Code: code, Message: message}
}
