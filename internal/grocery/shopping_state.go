package grocery

import (
	"errors"
	"fmt"
	"strings"

	"github.com/aranlucas/agents/internal/groceries"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/genai"
)

func hydrateShoppingProfileState(repository groceries.ShoppingRepository) agent.BeforeAgentCallback {
	shopping := ShoppingResources{Repository: repository}
	return func(ctx agent.Context) (*genai.Content, error) {
		if _, err := shopping.refreshShoppingProfileState(ctx); err != nil {
			return nil, fmt.Errorf("hydrate shopping profile state: %w", err)
		}
		return nil, nil
	}
}

func (shopping ShoppingResources) refreshShoppingProfileState(ctx agent.Context) (groceries.ShoppingProfile, error) {
	if shopping.Repository == nil {
		return groceries.ShoppingProfile{}, errors.New("grocery shopping repository is required")
	}
	profile, err := shopping.Repository.ShoppingProfile(ctx, strings.TrimSpace(ctx.UserID()))
	if err != nil {
		return groceries.ShoppingProfile{}, err
	}
	if err := writeShoppingProfileState(ctx, profile); err != nil {
		return groceries.ShoppingProfile{}, err
	}
	return profile, nil
}

func writeShoppingProfileState(ctx agent.Context, profile groceries.ShoppingProfile) error {
	return writeProjectedShoppingProfileState(ctx, projectShoppingProfileState(profile))
}

func writeShoppingPantryState(ctx agent.Context, pantry []groceries.PantryItem) error {
	profile := readState(ctx.ReadonlyState()).ShoppingProfile
	profile.Pantry = projectShoppingPantry(pantry)
	return writeProjectedShoppingProfileState(ctx, profile)
}

func writeShoppingEquipmentState(ctx agent.Context, equipment []groceries.EquipmentItem) error {
	profile := readState(ctx.ReadonlyState()).ShoppingProfile
	profile.Equipment = projectShoppingEquipment(equipment)
	return writeProjectedShoppingProfileState(ctx, profile)
}

func writeShoppingOrdersState(ctx agent.Context, orders []groceries.Order) error {
	profile := readState(ctx.ReadonlyState()).ShoppingProfile
	profile.RecentOrders = mergeShoppingOrders(projectShoppingOrders(orders), profile.RecentOrders)
	return writeProjectedShoppingProfileState(ctx, profile)
}

func writeShoppingPreferredStoreState(ctx agent.Context, store *groceries.PreferredStore) error {
	profile := readState(ctx.ReadonlyState()).ShoppingProfile
	profile.PreferredStore = projectShoppingPreferredStore(store)
	return writeProjectedShoppingProfileState(ctx, profile)
}

func writeProjectedShoppingProfileState(ctx agent.Context, projected ShoppingProfileState) error {
	if err := ctx.State().Set("shopping_profile", projected); err != nil {
		return fmt.Errorf("set shopping_profile state: %w", err)
	}
	return nil
}

func projectShoppingProfileState(profile groceries.ShoppingProfile) ShoppingProfileState {
	projected := emptyShoppingProfileState()
	if profile.PreferredStore != nil {
		projected.PreferredStore = projectShoppingPreferredStore(profile.PreferredStore)
	}
	projected.Pantry = projectShoppingPantry(profile.Pantry)
	projected.Equipment = projectShoppingEquipment(profile.Equipment)
	projected.RecentOrders = projectShoppingOrders(profile.RecentOrders)
	projected.FrequentItems = make([]ShoppingFrequentItemState, 0, len(profile.FrequentItems))
	for _, item := range profile.FrequentItems {
		projected.FrequentItems = append(projected.FrequentItems, ShoppingFrequentItemState{
			Name: item.Name, UPC: item.UPC, Orders: item.Orders, TotalQuantity: item.TotalQuantity,
		})
	}
	return projected
}

func projectShoppingPantry(pantry []groceries.PantryItem) []ShoppingPantryItemState {
	projected := make([]ShoppingPantryItemState, 0, len(pantry))
	for _, item := range pantry {
		projected = append(projected, ShoppingPantryItemState{
			Name: item.Name, Quantity: item.Quantity, AddedAt: item.AddedAt, ExpiresAt: cloneInt64(item.ExpiresAt),
		})
	}
	return projected
}

func projectShoppingEquipment(equipment []groceries.EquipmentItem) []ShoppingEquipmentItemState {
	projected := make([]ShoppingEquipmentItemState, 0, len(equipment))
	for _, item := range equipment {
		projected = append(projected, ShoppingEquipmentItemState{
			Name: item.Name, Category: cloneString(item.Category), AddedAt: item.AddedAt,
		})
	}
	return projected
}

func projectShoppingOrders(orders []groceries.Order) []ShoppingOrderState {
	projected := make([]ShoppingOrderState, 0, len(orders))
	for _, order := range orders {
		items := make([]ShoppingOrderItemState, 0, len(order.Items))
		for _, item := range order.Items {
			items = append(items, ShoppingOrderItemState{
				UPC: item.UPC, Name: item.Name, Quantity: item.Quantity, Price: cloneFloat64(item.Price),
			})
		}
		projected = append(projected, ShoppingOrderState{
			ID: order.ID, Items: items, TotalItems: order.TotalItems, EstimatedTotal: cloneFloat64(order.EstimatedTotal),
			PlacedAt: order.PlacedAt, LocationID: cloneString(order.LocationID), Notes: cloneString(order.Notes),
		})
	}
	return projected
}

func mergeShoppingOrders(current, hydrated []ShoppingOrderState) []ShoppingOrderState {
	merged := make([]ShoppingOrderState, 0, len(current)+len(hydrated))
	seen := make(map[string]bool, len(current)+len(hydrated))
	for _, orders := range [][]ShoppingOrderState{current, hydrated} {
		for _, order := range orders {
			if order.ID != "" && seen[order.ID] {
				continue
			}
			if order.ID != "" {
				seen[order.ID] = true
			}
			merged = append(merged, order)
		}
	}
	return merged
}

func projectShoppingPreferredStore(store *groceries.PreferredStore) *ShoppingPreferredStoreState {
	if store == nil {
		return nil
	}
	return new(ShoppingPreferredStoreState{
		LocationID: store.LocationID, Name: store.Name, Address: store.Address, Chain: store.Chain, SetAt: store.SetAt,
	})
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	return new(*value)
}

func cloneInt64(value *int64) *int64 {
	if value == nil {
		return nil
	}
	return new(*value)
}

func cloneFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	return new(*value)
}
