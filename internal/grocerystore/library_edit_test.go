package grocerystore

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
	"google.golang.org/adk/v2/artifact"
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

func TestAddMixedItemsReturnsPersistedPositions(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	t.Cleanup(func() { _ = store.Close() })
	items, err := store.AddItems(t.Context(), "owner", "list_1", []NewItem{
		{Name: "Bread", Product: &ProductReference{Provider: "kroger", ID: "bread"}},
		{Name: "Eggs"},
		{Name: "Rice", Product: &ProductReference{Provider: "other", ID: "rice"}},
	}, time.UnixMilli(2000))
	if err != nil {
		t.Fatal(err)
	}
	list, err := store.GetList(t.Context(), "owner", "list_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || len(list.Items) != 4 {
		t.Fatalf("items = %#v, list = %#v", items, list)
	}
	for i, item := range items {
		if item.Position != i+1 || item.ID != list.Items[i+1].ID {
			t.Fatalf("item %d = %#v, persisted = %#v", i, item, list.Items[i+1])
		}
	}
	if items[0].Product == nil || items[0].Product.ID != "bread" || items[1].Product != nil || items[2].Product == nil || items[2].Product.Provider != "other" {
		t.Fatalf("identities = %#v", items)
	}
}

func TestUpdateListArchivesAndRestoresWithoutTouchingItems(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	archived := StatusArchived
	list, err := store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Status: &archived}, time.UnixMilli(2000))
	if err != nil || list.Status != StatusArchived || list.Title != "Original" || len(list.Items) != 1 {
		t.Fatalf("archived list = %#v, %v", list, err)
	}
	active := StatusActive
	list, err = store.UpdateList(t.Context(), "owner", "list_1", ListPatch{Status: &active}, time.UnixMilli(3000))
	if err != nil || list.Status != StatusActive || list.UpdatedAt != 3000 || len(list.Items) != 1 {
		t.Fatalf("restored list = %#v, %v", list, err)
	}
}

func TestUpdateListRejectsUnauthorizedArchive(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	archived := StatusArchived
	if _, err := store.UpdateList(t.Context(), "other-user", "list_1", ListPatch{Status: &archived}, time.UnixMilli(2000)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("UpdateList error = %v", err)
	}
	list, err := store.GetList(t.Context(), "owner", "list_1")
	if err != nil || list.Status != StatusActive || list.UpdatedAt != 1000 {
		t.Fatalf("unauthorized archive changed list: %#v, %v", list, err)
	}
}

func newRecipeStatusStore(t *testing.T) *Store {
	t.Helper()
	store, db := newLibraryEditStore(t)
	if _, err := db.Run(t.Context(),
		storage.Statement{SQL: `INSERT INTO households (id, name, created_by, created_at) VALUES ('household_1', 'Casa', 'owner', 1000)`},
		storage.Statement{SQL: `INSERT INTO household_members (household_id, clerk_user_id, role, joined_at) VALUES ('household_1', 'owner', 'owner', 1000), ('household_1', 'member', 'member', 1000)`},
		storage.Statement{SQL: `INSERT INTO recipes (id, household_id, owner_user_id, title, status, created_at, updated_at) VALUES ('recipe_personal', NULL, 'owner', 'Pasta', 'active', 1000, 1000)`},
		storage.Statement{SQL: `INSERT INTO recipes (id, household_id, owner_user_id, title, status, created_at, updated_at) VALUES ('recipe_shared', 'household_1', 'owner', 'Soup', 'active', 1000, 1000)`},
	); err != nil {
		t.Fatal(err)
	}
	return store
}

func TestSetRecipeStatusArchivesAndRestoresOwnedRecipe(t *testing.T) {
	store := newRecipeStatusStore(t)
	recipe, err := store.SetRecipeStatus(t.Context(), "owner", "recipe_personal", StatusArchived, time.UnixMilli(2000))
	if err != nil || recipe.Status != StatusArchived || recipe.UpdatedAt != 2000 || recipe.Title != "Pasta" {
		t.Fatalf("archived recipe = %#v, %v", recipe, err)
	}
	recipe, err = store.SetRecipeStatus(t.Context(), "owner", "recipe_personal", StatusActive, time.UnixMilli(3000))
	if err != nil || recipe.Status != StatusActive || recipe.UpdatedAt != 3000 {
		t.Fatalf("restored recipe = %#v, %v", recipe, err)
	}
}

func TestSetRecipeStatusAllowsHouseholdMembers(t *testing.T) {
	store := newRecipeStatusStore(t)
	recipe, err := store.SetRecipeStatus(t.Context(), "member", "recipe_shared", StatusArchived, time.UnixMilli(2000))
	if err != nil || recipe.Status != StatusArchived {
		t.Fatalf("member archive = %#v, %v", recipe, err)
	}
}

func TestSetRecipeStatusRejectsOutsidersAndUnknownStatuses(t *testing.T) {
	store := newRecipeStatusStore(t)
	for _, recipeID := range []string{"recipe_personal", "recipe_shared"} {
		if _, err := store.SetRecipeStatus(t.Context(), "member-of-nothing", recipeID, StatusArchived, time.UnixMilli(2000)); !errors.Is(err, ErrNotFound) {
			t.Fatalf("outsider archive of %s error = %v", recipeID, err)
		}
	}
	// A household member cannot reach another member's personal recipe.
	if _, err := store.SetRecipeStatus(t.Context(), "member", "recipe_personal", StatusArchived, time.UnixMilli(2000)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("member archive of personal recipe error = %v", err)
	}
	if _, err := store.SetRecipeStatus(t.Context(), "owner", "recipe_personal", "deleted", time.UnixMilli(2000)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown status error = %v", err)
	}
	for _, recipeID := range []string{"recipe_personal", "recipe_shared"} {
		recipe, err := store.GetRecipe(t.Context(), "owner", recipeID)
		if err != nil || recipe.Status != StatusActive || recipe.UpdatedAt != 1000 {
			t.Fatalf("rejected status change modified %s: %#v, %v", recipeID, recipe, err)
		}
	}
}

func TestSetRecipeStatusRepublishesSavedSnapshot(t *testing.T) {
	store, _ := newLibraryEditStore(t)
	store.artifacts = newExplicitArtifactService()
	saved, err := store.SaveRecipe(t.Context(), "owner", SavedRecipeInput{
		Title: "Pasta", Ingredients: []NewIngredient{{Name: "Pasta"}}, Steps: []string{"Boil"},
	}, time.UnixMilli(1000))
	if err != nil || saved.ArtifactVersion != 1 {
		t.Fatalf("saved recipe = %#v, %v", saved, err)
	}
	archived, err := store.SetRecipeStatus(t.Context(), "owner", saved.ID, StatusArchived, time.UnixMilli(2000))
	if err != nil || archived.ArtifactVersion != 2 {
		t.Fatalf("archived recipe = %#v, %v", archived, err)
	}
	loaded, err := store.artifacts.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "owner", SessionID: saved.ID, FileName: recipeArtifactName,
	})
	if err != nil || loaded.Part == nil || loaded.Part.InlineData == nil || !strings.Contains(string(loaded.Part.InlineData.Data), `"status":"archived"`) {
		t.Fatalf("snapshot = %#v, %v", loaded, err)
	}
}
