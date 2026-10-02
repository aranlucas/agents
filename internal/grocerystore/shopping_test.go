package grocerystore

import (
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
	"google.golang.org/adk/v2/artifact"
)

func TestAddPantryItemsMergesCaseInsensitiveNames(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1, 3:
			if len(statements) != 1 || !strings.Contains(statements[0].SQL, "ON CONFLICT(user_id, name_key) DO UPDATE") {
				t.Fatalf("merge statements = %#v", statements)
			}
			if statements[0].Params[2] != "eggs" {
				t.Fatalf("name_key = %#v", statements[0].Params[2])
			}
			wantAddedAt := int64(1)
			if requests == 3 {
				wantAddedAt = 2
			}
			if statements[0].Params[4] != float64(wantAddedAt) {
				t.Fatalf("added_at = %#v, want Unix seconds %d", statements[0].Params[4], wantAddedAt)
			}
			if requests == 1 && statements[0].Params[5] != float64(1_700_000_000) {
				t.Fatalf("expires_at = %#v, want Unix seconds", statements[0].Params[5])
			}
			return []storage.Result{mutationResult(1)}
		case 2:
			return []storage.Result{queryResult(t, PantryItem{Name: "Eggs", Quantity: 2, AddedAt: 1})}
		case 4:
			return []storage.Result{queryResult(t, PantryItem{Name: "Eggs", Quantity: 5, AddedAt: 2})}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})

	expiresAt := int64(1_700_000_000)
	if _, err := store.AddPantryItems(t.Context(), "user_1", []PantryItem{{Name: "Eggs", Quantity: 2, ExpiresAt: &expiresAt}}, time.UnixMilli(1_000)); err != nil {
		t.Fatal(err)
	}
	pantry, err := store.AddPantryItems(t.Context(), "user_1", []PantryItem{{Name: " eggs ", Quantity: 3}}, time.UnixMilli(2_000))
	if err != nil {
		t.Fatal(err)
	}
	if len(pantry) != 1 || pantry[0].Name != "Eggs" || pantry[0].Quantity != 5 || pantry[0].AddedAt != 2 {
		t.Fatalf("pantry = %#v", pantry)
	}
}

func TestRecordOrderWritesOrderAndItemsInOneBatch(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 5 || !strings.Contains(statements[0].SQL, "INSERT INTO shopping_orders") ||
				!strings.Contains(statements[1].SQL, "INSERT INTO shopping_order_items") ||
				!strings.Contains(statements[2].SQL, "INSERT OR REPLACE INTO shopping_order_item_product_refs") ||
				!strings.Contains(statements[3].SQL, "INSERT INTO shopping_order_items") ||
				!strings.Contains(statements[4].SQL, "INSERT OR REPLACE INTO shopping_order_item_product_refs") {
				t.Fatalf("record statements = %#v", statements)
			}
			if statements[2].Params[2] != "kroger" || statements[2].Params[3] != "upc_1" ||
				statements[4].Params[2] != "trader_joes" || statements[4].Params[3] != "sku_2" {
				t.Fatalf("product reference statements = %#v / %#v", statements[2], statements[4])
			}
			if statements[0].Params[4] != float64(1) {
				t.Fatalf("placed_at = %#v, want Unix seconds", statements[0].Params[4])
			}
			return mutationResults(len(statements))
		case 2:
			if len(statements) != 2 || !strings.Contains(statements[0].SQL, "ORDER BY placed_at DESC") ||
				!strings.Contains(statements[1].SQL, "ORDER BY so.placed_at DESC, soi.position") {
				t.Fatalf("recent-order statements = %#v", statements)
			}
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
		if len(statements) != 1 || !strings.Contains(statements[0].SQL, "FROM kroger_account_links") {
			t.Fatalf("statements = %#v", statements)
		}
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

func TestLinkKrogerAccountRekeysNamespacedRows(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 16 || !strings.Contains(statements[0].SQL, "ON CONFLICT(kroger_sub) DO UPDATE") {
			t.Fatalf("statements = %#v", statements)
		}
		tables := []struct {
			name   string
			column string
		}{
			{name: "pantry_items", column: "user_id"},
			{name: "equipment_items", column: "user_id"},
			{name: "shopping_orders", column: "user_id"},
			{name: "preferred_stores", column: "user_id"},
			{name: "grocery_lists", column: "owner_user_id"},
			{name: "recipes", column: "owner_user_id"},
		}
		for index, table := range tables {
			update, cleanup := statements[1+index*2], statements[2+index*2]
			if !strings.Contains(update.SQL, "UPDATE OR IGNORE "+table.name+" SET "+table.column+" = ?") ||
				!strings.Contains(cleanup.SQL, "DELETE FROM "+table.name+" WHERE "+table.column+" = ?") {
				t.Fatalf("%s statements = %#v / %#v", table.name, update, cleanup)
			}
		}
		if !strings.Contains(statements[13].SQL, "DELETE FROM shopping_profile_artifacts") ||
			!strings.Contains(statements[14].SQL, "DELETE FROM shopping_profile_snapshot_jobs") ||
			!strings.Contains(statements[15].SQL, "DELETE FROM shopping_profile_revisions") {
			t.Fatalf("artifact cleanup statements = %#v", statements[13:])
		}
		return mutationResults(len(statements))
	})

	if err := store.LinkKrogerAccount(t.Context(), "kroger_sub_1", "user_1", time.UnixMilli(1_000)); err != nil {
		t.Fatal(err)
	}
}

func TestSetPreferredStoreWithoutArtifactServiceUsesUnixSeconds(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 3 || !strings.Contains(statements[0].SQL, "ON CONFLICT(user_id) DO UPDATE") ||
			!strings.Contains(statements[1].SQL, "INSERT INTO preferred_store_providers") ||
			statements[1].Params[1] != "trader_joes" {
			t.Fatalf("preferred-store statements = %#v", statements)
		}
		if statements[0].Params[5] != float64(1) {
			t.Fatalf("set_at = %#v, want Unix seconds", statements[0].Params[5])
		}
		return []storage.Result{
			mutationResult(1),
			mutationResult(1),
			queryResult(t, PreferredStore{Provider: "trader_joes", LocationID: "loc_1", Name: "Trader Joe's", SetAt: 1}),
		}
	})
	stored, err := store.SetPreferredStore(t.Context(), "user_1", PreferredStore{Provider: "trader_joes", LocationID: "loc_1", Name: "Trader Joe's"}, time.UnixMilli(1_000))
	if err != nil {
		t.Fatal(err)
	}
	if stored.Provider != "trader_joes" {
		t.Fatalf("stored preferred store = %#v", stored)
	}
}

func TestShoppingProfileLoadsCompleteProfileInOneD1Batch(t *testing.T) {
	category := "appliance"
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 8 || !strings.Contains(statements[5].SQL, "MIN(soi.name)") ||
			!strings.Contains(statements[5].SQL, "GROUP BY opr.provider, opr.product_id") ||
			!strings.Contains(statements[6].SQL, "shopping_profile_revisions") ||
			!strings.Contains(statements[7].SQL, "shopping_profile_artifacts") {
			t.Fatalf("shopping profile statements = %#v", statements)
		}
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

func TestSaveListPersistsProductReference(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 4 || !strings.Contains(statements[1].SQL, "INSERT INTO grocery_list_items") ||
				!strings.Contains(statements[2].SQL, "INSERT OR REPLACE INTO grocery_list_item_product_refs") ||
				statements[2].Params[1] != "trader_joes" || statements[2].Params[2] != "sku_1700" {
				t.Fatalf("save statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			if len(statements) != 2 || !strings.Contains(statements[1].SQL, "LEFT JOIN grocery_list_item_product_refs gpr ON gpr.item_id = gli.id") ||
				!strings.Contains(statements[1].SQL, "gpr.provider AS product_provider") {
				t.Fatalf("get statements = %#v", statements)
			}
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 1_000}),
				queryResult(t, map[string]any{"id": "item_1", "list_id": "list_1", "name": "Milk", "quantity": "1", "added_by": "user_1", "updated_at": 1_000, "product_provider": "trader_joes", "product_id": "sku_1700"}),
			}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.artifacts = artifact.InMemoryService()
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

func TestDeleteItemRemovesUPCRow(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 4 || !strings.Contains(statements[0].SQL, "DELETE FROM grocery_list_items") ||
				statements[1].SQL != "DELETE FROM grocery_list_item_upcs WHERE item_id = ?" || statements[1].Params[0] != "item_1" ||
				statements[2].SQL != "DELETE FROM grocery_list_item_product_refs WHERE item_id = ?" || statements[2].Params[0] != "item_1" {
				t.Fatalf("delete statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t),
			}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})

	if err := store.DeleteItem(t.Context(), "user_1", "list_1", "item_1", time.UnixMilli(2_000)); err != nil {
		t.Fatal(err)
	}
}

func TestAddItemsPersistsLegacyUPCAsKrogerProductReference(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 3 || !strings.Contains(statements[0].SQL, "INSERT INTO grocery_list_items") ||
				!strings.Contains(statements[1].SQL, "INSERT OR REPLACE INTO grocery_list_item_product_refs") ||
				statements[1].Params[1] != "kroger" || statements[1].Params[2] != "upc_1" {
				t.Fatalf("add statements = %#v", statements)
			}
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
