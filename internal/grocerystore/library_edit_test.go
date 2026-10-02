package grocerystore

import (
	"errors"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
)

func newLibraryEditStore(t *testing.T) (*Store, *storage.DB) {
	t.Helper()
	db, err := storage.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Run(t.Context(),
		storage.Statement{SQL: `INSERT INTO grocery_lists (id, owner_user_id, title, status, created_at, updated_at) VALUES ('list_1', 'owner', 'Original', 'active', 1000, 1000)`},
		storage.Statement{SQL: `INSERT INTO grocery_list_items (id, list_id, name, quantity, position, added_by, updated_at) VALUES ('item_old', 'list_1', 'Milk', '1', 0, 'owner', 1000)`},
		storage.Statement{SQL: `INSERT INTO grocery_list_item_upcs (item_id, upc) VALUES ('item_old', 'old-upc')`},
		storage.Statement{SQL: `INSERT INTO grocery_list_item_product_refs (item_id, provider, product_id) VALUES ('item_old', 'kroger', 'old-upc')`},
	); err != nil {
		t.Fatal(err)
	}
	return NewStore(db), db
}

func assertOriginalLibraryList(t *testing.T, store *Store) {
	t.Helper()
	list, err := store.GetList(t.Context(), "owner", "list_1")
	if err != nil || list.Title != "Original" || list.UpdatedAt != 1000 || len(list.Items) != 1 || list.Items[0].ID != "item_old" || list.Items[0].Product == nil || list.Items[0].Product.ID != "old-upc" {
		t.Fatalf("original list was changed: %#v, %v", list, err)
	}
}

func TestUpdateListRejectsInvalidCombinedEditBeforeMutation(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	title := "New title"
	items := []NewItem{{Name: ""}}
	_, err := store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Title: &title, Items: &items}, time.UnixMilli(2000))
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("UpdateList error = %v", err)
	}
	assertOriginalLibraryList(t, store)
}

func TestUpdateListRollsBackWholeEditOnWriteFailure(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	store.newID = func(string) (string, error) { return "same-item-id", nil }
	title := "New title"
	items := []NewItem{{Name: "Bread"}, {Name: "Eggs"}}
	_, err := store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Title: &title, Items: &items}, time.UnixMilli(2000))
	if err == nil {
		t.Fatal("UpdateList accepted duplicate item IDs")
	}
	assertOriginalLibraryList(t, store)
}

func TestUpdateListRejectsUnauthorizedCombinedEdit(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	title := "New title"
	items := []NewItem{{Name: "Bread", Product: &ProductReference{Provider: "kroger", ID: "new-upc"}}}
	_, err := store.UpdateList(t.Context(), "other-user", "list_1", ListPatch{Title: &title, Items: &items}, time.UnixMilli(2000))
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("UpdateList error = %v", err)
	}
	assertOriginalLibraryList(t, store)
}

func TestUpdateListCommitsTitleAndItemsTogether(t *testing.T) {
	store, db := newLibraryEditStore(t)
	title := "New title"
	upc := "new-upc"
	items := []NewItem{{Name: "Bread", Upc: &upc}}
	list, err := store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Title: &title, Items: &items}, time.UnixMilli(2000))
	if err != nil || list.Title != title || len(list.Items) != 1 || list.Items[0].Name != "Bread" || list.Items[0].Product == nil || list.Items[0].Product.ID != upc || list.Items[0].Product.Provider != "kroger" || list.Items[0].Upc == nil || *list.Items[0].Upc != upc {
		t.Fatalf("updated list = %#v, %v", list, err)
	}
	for _, table := range []string{"grocery_list_item_upcs", "grocery_list_item_product_refs"} {
		var remaining int
		if err := db.SQL().QueryRowContext(t.Context(), "SELECT COUNT(*) FROM "+table+" WHERE item_id = 'item_old'").Scan(&remaining); err != nil || remaining != 0 {
			t.Fatalf("old product references in %s = %d, %v", table, remaining, err)
		}
	}
}

func TestReplaceListItemsPreservesTitleAndCleansUpProductReferences(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	list, err := store.ReplaceListItems(t.Context(), "owner", "list_1", []NewItem{{Name: "Bread"}}, time.UnixMilli(2000))
	if err != nil || list.Title != "Original" || len(list.Items) != 1 || list.Items[0].Name != "Bread" || list.Items[0].Product != nil {
		t.Fatalf("replaced list = %#v, %v", list, err)
	}
}

func TestUpdateListCanClearItemsWhileRenaming(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	title := "Empty list"
	items := []NewItem{}
	list, err := store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Title: &title, Items: &items}, time.UnixMilli(2000))
	if err != nil || list.Title != title || len(list.Items) != 0 {
		t.Fatalf("cleared list = %#v, %v", list, err)
	}
}
