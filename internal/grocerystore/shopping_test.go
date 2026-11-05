package grocerystore

import (
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
)

func TestRecordOrderCountsItemsAndRecentOrdersGroupProducts(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			return mutationResults(len(statements))
		case 2:
			return []storage.Result{
				queryResult(
					t,
					Order{ID: "order_2", TotalItems: 1, PlacedAt: 2},
					Order{ID: "order_1", TotalItems: 3, PlacedAt: 1},
				),
				queryResult(
					t,
					map[string]any{"order_id": "order_2", "position": 0, "upc": "upc_3", "name": "Bread", "quantity": 1, "product_provider": "kroger", "product_id": "upc_3"},
					map[string]any{"order_id": "order_1", "position": 0, "upc": "upc_1", "name": "Milk", "quantity": 1, "product_provider": "kroger", "product_id": "upc_1"},
					map[string]any{"order_id": "order_1", "position": 1, "upc": "", "name": "Eggs", "quantity": 2, "product_provider": "trader_joes", "product_id": "sku_2"},
				),
			}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.newID = func(string) (string, error) { return "order_1", nil }

	recorded, err := store.RecordOrder(t.Context(), "user_1", Order{Items: []OrderItem{
		{UPC: "upc_1", Name: "Milk", Quantity: 1},
		{Product: &ProductReference{Provider: "trader_joes", ID: "sku_2"}, Name: "Eggs", Quantity: 2},
	}}, time.UnixMilli(1_000))
	if err != nil {
		t.Fatal(err)
	}
	if recorded.ID != "order_1" || recorded.TotalItems != 3 || recorded.PlacedAt != 1 {
		t.Fatalf("recorded = %#v", recorded)
	}

	orders, err := store.RecentOrders(t.Context(), "user_1", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(orders) != 2 || orders[0].ID != "order_2" || len(orders[1].Items) != 2 || orders[1].Items[1].Name != "Eggs" ||
		orders[1].Items[1].Product == nil || orders[1].Items[1].Product.Provider != "trader_joes" || orders[1].Items[1].UPC != "" {
		t.Fatalf("orders = %#v", orders)
	}
}

func TestResolveShopperFallsBackToKrogerNamespace(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		if requests == 1 {
			return []storage.Result{queryResult(t)}
		}
		return []storage.Result{queryResult(t, map[string]string{"clerk_user_id": "user_1"})}
	})

	userID, err := store.ResolveShopper(t.Context(), "kroger_sub_1")
	if err != nil || userID != "kroger:kroger_sub_1" {
		t.Fatalf("fallback/error = %q / %v", userID, err)
	}
	userID, err = store.ResolveShopper(t.Context(), "kroger_sub_1")
	if err != nil || userID != "user_1" {
		t.Fatalf("linked/error = %q / %v", userID, err)
	}
}

func TestShoppingProfileDecodesEveryProfileSection(t *testing.T) {
	category := "appliance"
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		return []storage.Result{
			queryResult(t, PreferredStore{Provider: "kroger", LocationID: "loc_1", Name: "Kroger", SetAt: 1}),
			queryResult(t, PantryItem{Name: "Eggs", Quantity: 12, AddedAt: 1}),
			queryResult(t, EquipmentItem{Name: "Air fryer", Category: &category, AddedAt: 1}),
			queryResult(t), queryResult(t),
			queryResult(t, FrequentItem{Name: "Milk", UPC: "upc_1", Orders: 1, TotalQuantity: 1}),
			queryResult(t), queryResult(t),
		}
	})
	profile, err := store.ShoppingProfile(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	if profile.PreferredStore == nil || len(profile.Pantry) != 1 || len(profile.Equipment) != 1 || len(profile.FrequentItems) != 1 {
		t.Fatalf("shopping profile = %#v", profile)
	}
}

func TestSaveListPreservesProviderNeutralProductIdentity(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			return mutationResults(len(statements))
		case 2:
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 1_000}),
				queryResult(t, map[string]any{"id": "item_1", "list_id": "list_1", "name": "Milk", "quantity": "1", "added_by": "user_1", "updated_at": 1_000, "product_provider": "trader_joes", "product_id": "sku_1700"}),
			}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.artifacts = newExplicitArtifactService()
	ids := []string{"list_1", "item_1"}
	store.newID = func(string) (string, error) {
		id := ids[0]
		ids = ids[1:]
		return id, nil
	}

	product := ProductReference{Provider: "trader_joes", ID: "sku_1700"}
	saved, err := store.SaveList(t.Context(), "user_1", SavedListInput{Title: "Weekend", Items: []NewItem{{Name: "Milk", Product: &product}}}, time.UnixMilli(1_000))
	if err != nil || saved.Items[0].Product == nil || *saved.Items[0].Product != product || saved.Items[0].Upc != nil {
		t.Fatalf("saved/error = %#v / %v", saved, err)
	}
	loaded, err := store.GetList(t.Context(), "user_1", "list_1")
	if err != nil || len(loaded.Items) != 1 || loaded.Items[0].Product == nil || *loaded.Items[0].Product != product || loaded.Items[0].Upc != nil {
		t.Fatalf("loaded/error = %#v / %v", loaded, err)
	}
}

func TestAddItemsNormalizesLegacyUPCToKrogerProductIdentity(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			return mutationResults(len(statements))
		case 2:
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, map[string]any{"id": "item_1", "list_id": "list_1", "name": "Milk", "quantity": "1", "added_by": "user_1", "updated_at": 2_000, "product_provider": "kroger", "product_id": "upc_1"}),
			}
		case 3:
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, map[string]any{"id": "item_1", "list_id": "list_1", "name": "Milk", "quantity": "1", "added_by": "user_1", "updated_at": 2_000, "product_provider": "kroger", "product_id": "upc_1"}),
			}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.newID = func(string) (string, error) { return "item_1", nil }
	upc := "upc_1"

	items, err := store.AddItems(t.Context(), "user_1", "list_1", []NewItem{{Name: "Milk", Upc: &upc}}, time.UnixMilli(2_000))
	if err != nil || len(items) != 1 || items[0].Upc == nil || *items[0].Upc != upc ||
		items[0].Product == nil || items[0].Product.Provider != "kroger" || items[0].Product.ID != upc {
		t.Fatalf("items/error = %#v / %v", items, err)
	}
	list, err := store.GetList(t.Context(), "user_1", "list_1")
	if err != nil || len(list.Items) != 1 || list.Items[0].Upc == nil || *list.Items[0].Upc != upc ||
		list.Items[0].Product == nil || list.Items[0].Product.Provider != "kroger" || list.Items[0].Product.ID != upc {
		t.Fatalf("list/error = %#v / %v", list, err)
	}
}

func mutationResults(count int) []storage.Result {
	results := make([]storage.Result, count)
	for index := range results {
		results[index] = mutationResult(1)
	}
	return results
}
