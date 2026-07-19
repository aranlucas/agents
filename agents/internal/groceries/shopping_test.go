package groceries

import (
	"strings"
	"testing"
	"time"

	"agents/internal/cloudflare"
	"google.golang.org/adk/v2/artifact"
)

func TestAddPantryItemsMergesCaseInsensitiveNames(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1, 3:
			if len(statements) != 1 || !strings.Contains(statements[0].SQL, "ON CONFLICT(user_id, name_key) DO UPDATE") {
				t.Fatalf("merge statements = %#v", statements)
			}
			if statements[0].Params[2] != "eggs" {
				t.Fatalf("name_key = %#v", statements[0].Params[2])
			}
			return []cloudflare.Result{mutationResult(1)}
		case 2:
			return []cloudflare.Result{queryResult(t, PantryItem{Name: "Eggs", Quantity: 2, AddedAt: 1_000})}
		case 4:
			return []cloudflare.Result{queryResult(t, PantryItem{Name: "Eggs", Quantity: 5, AddedAt: 2_000})}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
			return nil
		}
	})

	if _, err := store.AddPantryItems(t.Context(), "user_1", []PantryItem{{Name: "Eggs", Quantity: 2}}, time.UnixMilli(1_000)); err != nil {
		t.Fatal(err)
	}
	pantry, err := store.AddPantryItems(t.Context(), "user_1", []PantryItem{{Name: " eggs ", Quantity: 3}}, time.UnixMilli(2_000))
	if err != nil {
		t.Fatal(err)
	}
	if len(pantry) != 1 || pantry[0].Name != "Eggs" || pantry[0].Quantity != 5 || pantry[0].AddedAt != 2_000 {
		t.Fatalf("pantry = %#v", pantry)
	}
}

func TestRecordOrderWritesOrderAndItemsInOneBatch(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 3 || !strings.Contains(statements[0].SQL, "INSERT INTO shopping_orders") ||
				!strings.Contains(statements[1].SQL, "INSERT INTO shopping_order_items") ||
				!strings.Contains(statements[2].SQL, "INSERT INTO shopping_order_items") {
				t.Fatalf("record statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			if len(statements) != 2 || !strings.Contains(statements[0].SQL, "ORDER BY placed_at DESC") ||
				!strings.Contains(statements[1].SQL, "ORDER BY so.placed_at DESC, soi.position") {
				t.Fatalf("recent-order statements = %#v", statements)
			}
			return []cloudflare.Result{
				queryResult(
					t,
					Order{ID: "order_2", TotalItems: 1, PlacedAt: 2_000},
					Order{ID: "order_1", TotalItems: 3, PlacedAt: 1_000},
				),
				queryResult(
					t,
					map[string]any{"order_id": "order_2", "position": 0, "upc": "upc_3", "name": "Bread", "quantity": 1},
					map[string]any{"order_id": "order_1", "position": 0, "upc": "upc_1", "name": "Milk", "quantity": 1},
					map[string]any{"order_id": "order_1", "position": 1, "upc": "upc_2", "name": "Eggs", "quantity": 2},
				),
			}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
			return nil
		}
	})
	store.newID = func(string) (string, error) { return "order_1", nil }

	recorded, err := store.RecordOrder(t.Context(), "user_1", Order{Items: []OrderItem{
		{UPC: "upc_1", Name: "Milk", Quantity: 1},
		{UPC: "upc_2", Name: "Eggs", Quantity: 2},
	}}, time.UnixMilli(1_000))
	if err != nil {
		t.Fatal(err)
	}
	if recorded.ID != "order_1" || recorded.TotalItems != 3 || recorded.PlacedAt != 1_000 {
		t.Fatalf("recorded = %#v", recorded)
	}

	orders, err := store.RecentOrders(t.Context(), "user_1", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(orders) != 2 || orders[0].ID != "order_2" || len(orders[1].Items) != 2 || orders[1].Items[1].Name != "Eggs" {
		t.Fatalf("orders = %#v", orders)
	}
}

func TestResolveShopperFallsBackToKrogerNamespace(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		if len(statements) != 1 || !strings.Contains(statements[0].SQL, "FROM kroger_account_links") {
			t.Fatalf("statements = %#v", statements)
		}
		if requests == 1 {
			return []cloudflare.Result{queryResult(t)}
		}
		return []cloudflare.Result{queryResult(t, map[string]string{"clerk_user_id": "user_1"})}
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
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 13 || !strings.Contains(statements[0].SQL, "INSERT OR REPLACE INTO kroger_account_links") {
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
			if update.Params[0] != "user_1" || update.Params[1] != "kroger:kroger_sub_1" || cleanup.Params[0] != "kroger:kroger_sub_1" {
				t.Fatalf("%s params = %#v / %#v", table.name, update.Params, cleanup.Params)
			}
		}
		return mutationResults(len(statements))
	})

	if err := store.LinkKrogerAccount(t.Context(), "kroger_sub_1", "user_1", time.UnixMilli(1_000)); err != nil {
		t.Fatal(err)
	}
}

func TestSaveListPersistsItemUPC(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 4 || !strings.Contains(statements[1].SQL, "INSERT INTO grocery_list_items") ||
				!strings.Contains(statements[2].SQL, "INSERT OR REPLACE INTO grocery_list_item_upcs") || statements[2].Params[1] != "0001111041700" {
				t.Fatalf("save statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			if len(statements) != 2 || !strings.Contains(statements[1].SQL, "LEFT JOIN grocery_list_item_upcs glu ON glu.item_id = gli.id") ||
				!strings.Contains(statements[1].SQL, "glu.upc AS upc") {
				t.Fatalf("get statements = %#v", statements)
			}
			return []cloudflare.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 1_000}),
				queryResult(t, Item{ID: "item_1", ListID: "list_1", Name: "Milk", Quantity: "1", Upc: testStringPointer("0001111041700"), AddedBy: "user_1", UpdatedAt: 1_000}),
			}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
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

	upc := "0001111041700"
	saved, err := store.SaveList(t.Context(), "user_1", SavedListInput{Title: "Weekend", Items: []NewItem{{Name: "Milk", Upc: &upc}}}, time.UnixMilli(1_000))
	if err != nil || saved.Items[0].Upc == nil || *saved.Items[0].Upc != upc {
		t.Fatalf("saved/error = %#v / %v", saved, err)
	}
	loaded, err := store.GetList(t.Context(), "user_1", "list_1")
	if err != nil || len(loaded.Items) != 1 || loaded.Items[0].Upc == nil || *loaded.Items[0].Upc != upc {
		t.Fatalf("loaded/error = %#v / %v", loaded, err)
	}
}

func TestDeleteItemRemovesUPCRow(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 3 || !strings.Contains(statements[0].SQL, "DELETE FROM grocery_list_items") ||
				statements[1].SQL != "DELETE FROM grocery_list_item_upcs WHERE item_id = ?" || statements[1].Params[0] != "item_1" {
				t.Fatalf("delete statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			return []cloudflare.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t),
			}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
			return nil
		}
	})

	if err := store.DeleteItem(t.Context(), "user_1", "list_1", "item_1", time.UnixMilli(2_000)); err != nil {
		t.Fatal(err)
	}
}

func TestReplaceListItemsCleansUpOrphanedUPCRows(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1:
			return []cloudflare.Result{queryResult(t, map[string]int{"present": 1})}
		case 2:
			if len(statements) != 5 || statements[0].SQL != "DELETE FROM grocery_list_item_upcs WHERE item_id IN (SELECT id FROM grocery_list_items WHERE list_id = ?)" ||
				!strings.Contains(statements[1].SQL, "DELETE FROM grocery_list_items") ||
				!strings.Contains(statements[3].SQL, "INSERT OR REPLACE INTO grocery_list_item_upcs") {
				t.Fatalf("replacement statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 3:
			return []cloudflare.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, Item{ID: "item_new", ListID: "list_1", Name: "Bread", Quantity: "1", Upc: testStringPointer("upc_new"), AddedBy: "user_1", UpdatedAt: 2_000}),
			}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
			return nil
		}
	})
	store.newID = func(string) (string, error) { return "item_new", nil }
	upc := "upc_new"

	list, err := store.ReplaceListItems(t.Context(), "user_1", "list_1", []NewItem{{Name: "Bread", Upc: &upc}}, time.UnixMilli(2_000))
	if err != nil || len(list.Items) != 1 || list.Items[0].Upc == nil || *list.Items[0].Upc != upc {
		t.Fatalf("list/error = %#v / %v", list, err)
	}
}

func TestAddItemsPersistsUPC(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		switch requests {
		case 1:
			if len(statements) != 3 || !strings.Contains(statements[0].SQL, "INSERT INTO grocery_list_items") ||
				!strings.Contains(statements[1].SQL, "INSERT OR REPLACE INTO grocery_list_item_upcs") || statements[1].Params[1] != "upc_1" {
				t.Fatalf("add statements = %#v", statements)
			}
			return mutationResults(len(statements))
		case 2:
			return []cloudflare.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, Item{ID: "item_1", ListID: "list_1", Name: "Milk", Quantity: "1", Upc: testStringPointer("upc_1"), AddedBy: "user_1", UpdatedAt: 2_000}),
			}
		case 3:
			return []cloudflare.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Weekend", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, Item{ID: "item_1", ListID: "list_1", Name: "Milk", Quantity: "1", Upc: testStringPointer("upc_1"), AddedBy: "user_1", UpdatedAt: 2_000}),
			}
		default:
			t.Fatalf("unexpected D1 request %d: %#v", requests, statements)
			return nil
		}
	})
	store.newID = func(string) (string, error) { return "item_1", nil }
	upc := "upc_1"

	items, err := store.AddItems(t.Context(), "user_1", "list_1", []NewItem{{Name: "Milk", Upc: &upc}}, time.UnixMilli(2_000))
	if err != nil || len(items) != 1 || items[0].Upc == nil || *items[0].Upc != upc {
		t.Fatalf("items/error = %#v / %v", items, err)
	}
	list, err := store.GetList(t.Context(), "user_1", "list_1")
	if err != nil || len(list.Items) != 1 || list.Items[0].Upc == nil || *list.Items[0].Upc != upc {
		t.Fatalf("list/error = %#v / %v", list, err)
	}
}

func mutationResults(count int) []cloudflare.Result {
	results := make([]cloudflare.Result, count)
	for index := range results {
		results[index] = mutationResult(1)
	}
	return results
}

func testStringPointer(value string) *string {
	return &value
}
