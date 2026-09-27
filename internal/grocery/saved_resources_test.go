package grocery

import (
	"context"
	"iter"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/groceries"
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
		"save_current_list": true, "list_saved_lists": true, "get_saved_list": true, "update_saved_list": true,
		"save_current_recipe": true, "list_saved_recipes": true, "get_saved_recipe": true, "update_saved_recipe": true,
	}
	for _, candidate := range tools {
		delete(required, candidate.Name())
	}
	if len(required) != 0 || len(tools) != 9 {
		t.Fatalf("tools = %d, missing = %#v", len(tools), required)
	}
}

func TestListHouseholdsMakesSharedLibraryScopesDiscoverable(t *testing.T) {
	repository := &savedResourcesRepository{
		households: []groceries.Household{{ID: "household_1", Name: "Casa", Role: "owner"}},
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
	empty := []groceries.NewItem{}
	result, err := (SavedResources{Repository: repository}).UpdateSavedList(
		newSavedResourceContext(t, "user_1", mutableGroceryState{}),
		UpdateSavedListArgs{ID: "list_1", Items: &empty},
	)
	if err != nil || result.Error != nil || result.List == nil {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.replacedListID != "list_1" || repository.replacedItems == nil || len(repository.replacedItems) != 0 {
		t.Fatalf("replacement = list %q items %#v", repository.replacedListID, repository.replacedItems)
	}
}

type savedResourcesRepository struct {
	groceries.LibraryRepository
	listInput      groceries.SavedListInput
	recipeUserID   string
	recipeInput    groceries.SavedRecipeInput
	replacedListID string
	replacedItems  []groceries.NewItem
	households     []groceries.Household
}

func (r *savedResourcesRepository) ListHouseholds(context.Context, string) ([]groceries.Household, error) {
	return append([]groceries.Household{}, r.households...), nil
}

func (r *savedResourcesRepository) SaveList(_ context.Context, userID string, input groceries.SavedListInput, now time.Time) (groceries.List, error) {
	r.listInput = input
	return groceries.List{ID: "list_1", HouseholdID: input.HouseholdID, OwnerUserID: userID, Title: input.Title, Status: "active", CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli(), Items: []groceries.Item{}}, nil
}

func (r *savedResourcesRepository) SaveRecipe(_ context.Context, userID string, input groceries.SavedRecipeInput, now time.Time) (groceries.Recipe, error) {
	r.recipeUserID, r.recipeInput = userID, input
	return groceries.Recipe{ID: "recipe_1", OwnerUserID: userID, Title: input.Title, Status: "active", CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli()}, nil
}

func (r *savedResourcesRepository) ReplaceListItems(_ context.Context, _ string, listID string, items []groceries.NewItem, now time.Time) (groceries.List, error) {
	r.replacedListID = listID
	r.replacedItems = append([]groceries.NewItem{}, items...)
	return groceries.List{ID: listID, OwnerUserID: "user_1", Title: "Weekend", Status: "active", UpdatedAt: now.UnixMilli(), Items: []groceries.Item{}}, nil
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
