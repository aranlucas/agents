package grocery

import (
	"context"
	"iter"
	"slices"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/grocerystore"
	"github.com/aranlucas/agents/internal/storage"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

func TestGroceryLibraryToolsRegistersOneListAndRecipeLibrarySurface(t *testing.T) {
	tools, err := groceryLibraryTools(&savedResourcesRepository{})
	if err != nil {
		t.Fatal(err)
	}
	required := map[string]bool{
		"list_households":   true,
		"save_current_list": true, "list_saved_lists": true, "get_saved_list": true, "update_saved_list": true, "archive_saved_list": true,
		"save_current_recipe": true, "list_saved_recipes": true, "get_saved_recipe": true, "update_saved_recipe": true, "archive_saved_recipe": true,
	}
	for _, candidate := range tools {
		delete(required, candidate.Name())
	}
	if len(required) != 0 || len(tools) != 11 {
		t.Fatalf("tools = %d, missing = %#v", len(tools), required)
	}
}

func TestListHouseholdsMakesSharedLibraryScopesDiscoverable(t *testing.T) {
	repository := &savedResourcesRepository{
		households: []grocerystore.Household{{ID: "household_1", Name: "Casa", Role: "owner"}},
	}
	result, err := (SavedResources{Repository: repository}).ListHouseholds(
		newSavedResourceContext(t, "user_1", mutableGroceryState{}), struct{}{},
	)
	if err != nil || result.Error != nil || len(result.Households) != 1 || result.Households[0].ID != "household_1" {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
}

func TestSetRecipeWritesCompleteStructuredDraft(t *testing.T) {
	state := mutableGroceryState{}
	result, err := SetRecipe(newSavedResourceContext(t, "user_1", state), RecipeArgs{
		Title: "Pasta", Description: "Fast dinner", Servings: "4",
		Ingredients: []RecipeDraftIngredient{{Name: "Pasta", Quantity: "1", Unit: "lb"}},
		Steps:       []string{"Boil pasta"}, Tags: []string{"Dinner"},
	})
	if err != nil || !result.OK {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	recipe, ok := state["recipe"].(*RecipeDraft)
	if !ok || recipe.Title != "Pasta" || len(recipe.Ingredients) != 1 || len(recipe.Steps) != 1 {
		t.Fatalf("recipe state = %#v", state["recipe"])
	}
}

func TestSaveCurrentRecipeUsesPersonalLibraryOnlyWhenExplicitlyCalled(t *testing.T) {
	repository := &savedResourcesRepository{}
	state := mutableGroceryState{"recipe": RecipeDraft{
		Title: "Pasta", Ingredients: []RecipeDraftIngredient{{Name: "Pasta", Quantity: "1", Unit: "lb"}},
		Steps: []string{"Boil pasta"},
	}}
	saved := SavedResources{Repository: repository, Now: func() time.Time { return time.UnixMilli(2_000) }}

	result, err := saved.SaveCurrentRecipe(newSavedResourceContext(t, "user_1", state), SaveCurrentResourceArgs{})
	if err != nil || result.Error != nil || result.Recipe == nil {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.recipeUserID != "user_1" || repository.recipeInput.HouseholdID != nil || repository.recipeInput.Title != "Pasta" {
		t.Fatalf("saved recipe = user %q input %#v", repository.recipeUserID, repository.recipeInput)
	}
}

func TestSaveCurrentListPreservesGeneratedTitleAndMatchedQuantities(t *testing.T) {
	repository := &savedResourcesRepository{}
	state := mutableGroceryState{
		"list_title": "Weekend", "shopping_list": []string{"Milk", "Eggs"}, "status": StatusReady,
		"product_matches": []ProductMatch{{Query: "Milk", Size: "1 gal"}},
	}
	result, err := (SavedResources{Repository: repository}).SaveCurrentList(
		newSavedResourceContext(t, "user_1", state), SaveCurrentResourceArgs{},
	)
	if err != nil || result.Error != nil || result.List == nil {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.listInput.Title != "Weekend" || repository.listInput.HouseholdID != nil || len(repository.listInput.Items) != 2 || repository.listInput.Items[0].Quantity != "1 gal" || repository.listInput.Items[1].Quantity != "1" {
		t.Fatalf("saved list input = %#v", repository.listInput)
	}
}

func TestUpdateSavedListCanExplicitlyClearAllItems(t *testing.T) {
	repository := &savedResourcesRepository{}
	empty := []grocerystore.NewItem{}
	result, err := (SavedResources{Repository: repository}).UpdateSavedList(
		newSavedResourceContext(t, "user_1", mutableGroceryState{}),
		UpdateSavedListArgs{ID: "list_1", Items: &empty},
	)
	if err != nil || result.Error != nil || result.List == nil {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.updatedListID != "list_1" || repository.listPatch.Items == nil || len(*repository.listPatch.Items) != 0 {
		t.Fatalf("replacement = list %q items %#v", repository.updatedListID, repository.listPatch.Items)
	}
}

type savedResourcesRepository struct {
	grocerystore.LibraryRepository
	listInput     grocerystore.SavedListInput
	recipeUserID  string
	recipeInput   grocerystore.SavedRecipeInput
	updatedListID string
	listPatch     grocerystore.ListPatch
	updateCalls   int
	households    []grocerystore.Household
}

func (r *savedResourcesRepository) ListHouseholds(context.Context, string) ([]grocerystore.Household, error) {
	return append([]grocerystore.Household{}, r.households...), nil
}

func (r *savedResourcesRepository) SaveList(_ context.Context, userID string, input grocerystore.SavedListInput, now time.Time) (grocerystore.List, error) {
	r.listInput = input
	return grocerystore.List{ID: "list_1", HouseholdID: input.HouseholdID, OwnerUserID: userID, Title: input.Title, Status: "active", CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli(), Items: []grocerystore.Item{}}, nil
}

func (r *savedResourcesRepository) SaveRecipe(_ context.Context, userID string, input grocerystore.SavedRecipeInput, now time.Time) (grocerystore.Recipe, error) {
	r.recipeUserID, r.recipeInput = userID, input
	return grocerystore.Recipe{ID: "recipe_1", OwnerUserID: userID, Title: input.Title, Status: "active", CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli()}, nil
}

func (r *savedResourcesRepository) UpdateList(_ context.Context, _ string, listID string, patch grocerystore.ListPatch, now time.Time) (grocerystore.List, error) {
	r.updatedListID = listID
	r.listPatch = patch
	r.updateCalls++
	return grocerystore.List{ID: listID, OwnerUserID: "user_1", Title: "Weekend", Status: "active", UpdatedAt: now.UnixMilli(), Items: []grocerystore.Item{}}, nil
}

func TestUpdateSavedListSendsTitleAndItemsAsOneEdit(t *testing.T) {
	repository := &savedResourcesRepository{}
	title := "New title"
	items := []grocerystore.NewItem{{Name: "Bread"}}
	result, err := (SavedResources{Repository: repository}).UpdateSavedList(
		newSavedResourceContext(t, "user_1", mutableGroceryState{}),
		UpdateSavedListArgs{ID: "list_1", Title: &title, Items: &items},
	)
	if err != nil || result.Error != nil || result.List == nil {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.updateCalls != 1 || repository.updatedListID != "list_1" || repository.listPatch.Title != &title || repository.listPatch.Items != &items {
		t.Fatalf("repository edit = %#v", repository)
	}
}

type mutableGroceryState map[string]any

func (state mutableGroceryState) Get(key string) (any, error) {
	value, ok := state[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (state mutableGroceryState) Set(key string, value any) error {
	state[key] = value
	return nil
}

func (state mutableGroceryState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range state {
			if !yield(key, value) {
				return
			}
		}
	}
}

type savedResourceContext struct {
	agent.StrictContextMock
	userID string
	state  mutableGroceryState
}

func newSavedResourceContext(t *testing.T, userID string, state mutableGroceryState) *savedResourceContext {
	t.Helper()
	return &savedResourceContext{StrictContextMock: agent.NewStrictContextMock(t.Context()), userID: userID, state: state}
}

func (ctx *savedResourceContext) UserID() string                       { return ctx.userID }
func (ctx *savedResourceContext) State() session.State                 { return ctx.state }
func (ctx *savedResourceContext) ReadonlyState() session.ReadonlyState { return ctx.state }

func TestUpdateSavedListInvalidItemsDoNotRenamePersistedList(t *testing.T) {
	db, err := storage.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Run(t.Context(), storage.Statement{
		SQL: `INSERT INTO grocery_lists (id, owner_user_id, title, status, created_at, updated_at)
		      VALUES ('list_1', 'user_1', 'Original', 'active', 1000, 1000)`,
	}); err != nil {
		t.Fatal(err)
	}
	repository := grocerystore.NewStore(db)
	title := "New title"
	items := []grocerystore.NewItem{{Name: ""}}
	result, err := (SavedResources{Repository: repository}).UpdateSavedList(
		newSavedResourceContext(t, "user_1", mutableGroceryState{}),
		UpdateSavedListArgs{ID: "list_1", Title: &title, Items: &items},
	)
	if err != nil || result.Error == nil || result.Error.Code != "invalid_saved_list" {
		t.Fatalf("tool result/error = %#v / %v", result, err)
	}
	list, err := repository.GetList(t.Context(), "user_1", "list_1")
	if err != nil || list.Title != "Original" || list.UpdatedAt != 1000 {
		t.Fatalf("invalid tool edit changed persisted list: %#v, %v", list, err)
	}
}

func newSavedResourceStore(t *testing.T) *grocerystore.Store {
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
		storage.Statement{SQL: `INSERT INTO grocery_lists (id, owner_user_id, title, status, created_at, updated_at)
		      VALUES ('list_old', 'user_1', 'Thanksgiving', 'active', 1000, 1000), ('list_keep', 'user_1', 'Weekly', 'active', 1000, 1000)`},
		storage.Statement{SQL: `INSERT INTO recipes (id, owner_user_id, title, status, created_at, updated_at)
		      VALUES ('recipe_old', 'user_1', 'Stuffing', 'active', 1000, 1000), ('recipe_keep', 'user_1', 'Pasta', 'active', 1000, 1000)`},
	); err != nil {
		t.Fatal(err)
	}
	return grocerystore.NewStore(db)
}

func savedListIDs(result SavedListsResult) []string {
	ids := []string{}
	for _, list := range result.Lists {
		ids = append(ids, list.ID)
	}
	slices.Sort(ids)
	return ids
}

func savedRecipeIDs(result SavedRecipesResult) []string {
	ids := []string{}
	for _, recipe := range result.Recipes {
		ids = append(ids, recipe.ID)
	}
	slices.Sort(ids)
	return ids
}

func TestArchivedSavedListLeavesLibraryUntilRestored(t *testing.T) {
	saved := SavedResources{Repository: newSavedResourceStore(t), Now: func() time.Time { return time.UnixMilli(2_000) }}
	ctx := newSavedResourceContext(t, "user_1", mutableGroceryState{})

	archived, err := saved.ArchiveSavedList(ctx, ArchiveSavedResourceArgs{ID: "list_old"})
	if err != nil || archived.Error != nil || archived.List == nil || archived.List.Status != grocerystore.StatusArchived {
		t.Fatalf("archive result/error = %#v / %v", archived, err)
	}
	listed, err := saved.ListSavedLists(ctx, SavedResourceScopeArgs{})
	if err != nil || listed.Error != nil || !slices.Equal(savedListIDs(listed), []string{"list_keep"}) {
		t.Fatalf("default listing = %v (%#v / %v)", savedListIDs(listed), listed.Error, err)
	}
	listed, err = saved.ListSavedLists(ctx, SavedResourceScopeArgs{IncludeArchived: true})
	if err != nil || listed.Error != nil || !slices.Equal(savedListIDs(listed), []string{"list_keep", "list_old"}) {
		t.Fatalf("archived listing = %v (%#v / %v)", savedListIDs(listed), listed.Error, err)
	}

	restored, err := saved.ArchiveSavedList(ctx, ArchiveSavedResourceArgs{ID: "list_old", Restore: true})
	if err != nil || restored.Error != nil || restored.List == nil || restored.List.Status != grocerystore.StatusActive {
		t.Fatalf("restore result/error = %#v / %v", restored, err)
	}
	listed, err = saved.ListSavedLists(ctx, SavedResourceScopeArgs{})
	if err != nil || !slices.Equal(savedListIDs(listed), []string{"list_keep", "list_old"}) {
		t.Fatalf("listing after restore = %v (%v)", savedListIDs(listed), err)
	}
}

func TestArchivedSavedRecipeLeavesLibraryUntilRestored(t *testing.T) {
	saved := SavedResources{Repository: newSavedResourceStore(t), Now: func() time.Time { return time.UnixMilli(2_000) }}
	ctx := newSavedResourceContext(t, "user_1", mutableGroceryState{})

	archived, err := saved.ArchiveSavedRecipe(ctx, ArchiveSavedResourceArgs{ID: "recipe_old"})
	if err != nil || archived.Error != nil || archived.Recipe == nil || archived.Recipe.Status != grocerystore.StatusArchived {
		t.Fatalf("archive result/error = %#v / %v", archived, err)
	}
	listed, err := saved.ListSavedRecipes(ctx, SavedResourceScopeArgs{})
	if err != nil || listed.Error != nil || !slices.Equal(savedRecipeIDs(listed), []string{"recipe_keep"}) {
		t.Fatalf("default listing = %v (%#v / %v)", savedRecipeIDs(listed), listed.Error, err)
	}
	listed, err = saved.ListSavedRecipes(ctx, SavedResourceScopeArgs{IncludeArchived: true})
	if err != nil || !slices.Equal(savedRecipeIDs(listed), []string{"recipe_keep", "recipe_old"}) {
		t.Fatalf("archived listing = %v (%v)", savedRecipeIDs(listed), err)
	}

	restored, err := saved.ArchiveSavedRecipe(ctx, ArchiveSavedResourceArgs{ID: "recipe_old", Restore: true})
	if err != nil || restored.Error != nil || restored.Recipe == nil || restored.Recipe.Status != grocerystore.StatusActive {
		t.Fatalf("restore result/error = %#v / %v", restored, err)
	}
}

func TestArchiveSavedResourcesReportStructuredErrors(t *testing.T) {
	saved := SavedResources{Repository: newSavedResourceStore(t)}
	owner := newSavedResourceContext(t, "user_1", mutableGroceryState{})
	stranger := newSavedResourceContext(t, "user_2", mutableGroceryState{})

	if result, err := saved.ArchiveSavedList(owner, ArchiveSavedResourceArgs{ID: "  "}); err != nil || result.Error == nil || result.Error.Code != "invalid_saved_list" {
		t.Fatalf("blank list id = %#v / %v", result, err)
	}
	if result, err := saved.ArchiveSavedRecipe(owner, ArchiveSavedResourceArgs{}); err != nil || result.Error == nil || result.Error.Code != "invalid_saved_recipe" {
		t.Fatalf("blank recipe id = %#v / %v", result, err)
	}
	if result, err := saved.ArchiveSavedList(stranger, ArchiveSavedResourceArgs{ID: "list_old"}); err != nil || result.Error == nil || result.Error.Code != "saved_list_not_found" {
		t.Fatalf("stranger list archive = %#v / %v", result, err)
	}
	if result, err := saved.ArchiveSavedRecipe(stranger, ArchiveSavedResourceArgs{ID: "recipe_old"}); err != nil || result.Error == nil || result.Error.Code != "saved_recipe_not_found" {
		t.Fatalf("stranger recipe archive = %#v / %v", result, err)
	}
	listed, err := saved.ListSavedLists(owner, SavedResourceScopeArgs{})
	if err != nil || len(listed.Lists) != 2 {
		t.Fatalf("rejected archives changed the owner's library: %v (%v)", savedListIDs(listed), err)
	}
}
