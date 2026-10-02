package grocery

import (
	"errors"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/grocerystore"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type SavedResourceScopeArgs struct {
	HouseholdID *string `json:"household_id,omitempty" jsonschema:"Optional household id. Omit to use the signed-in user's personal library."`
}

type SavedResourceIDArgs struct {
	ID string `json:"id" jsonschema:"The exact saved resource id returned by a list or get tool."`
}

type SaveCurrentResourceArgs struct {
	HouseholdID *string `json:"household_id,omitempty" jsonschema:"Optional destination household id. Omit to save to the signed-in user's personal library."`
	Title       string  `json:"title,omitempty" jsonschema:"Optional title override. Omit to keep the generated title."`
}

type UpdateSavedListArgs struct {
	ID    string                  `json:"id" jsonschema:"The exact saved list id."`
	Title *string                 `json:"title,omitempty" jsonschema:"Optional replacement title."`
	Items *[]grocerystore.NewItem `json:"items,omitempty" jsonschema:"Optional complete replacement item set. Omit to leave items unchanged; use an empty array to clear the list."`
}

type UpdateSavedRecipeArgs struct {
	ID string `json:"id" jsonschema:"The exact saved recipe id."`
	grocerystore.RecipeContent
}

type SavedListsResult struct {
	Lists []grocerystore.List           `json:"lists,omitempty"`
	List  *grocerystore.List            `json:"list,omitempty"`
	Error *agentruntime.StructuredError `json:"error,omitempty"`
}

type SavedRecipesResult struct {
	Recipes []grocerystore.Recipe         `json:"recipes,omitempty"`
	Recipe  *grocerystore.Recipe          `json:"recipe,omitempty"`
	Error   *agentruntime.StructuredError `json:"error,omitempty"`
}

type GroceryHouseholdsResult struct {
	Households []grocerystore.Household      `json:"households,omitempty"`
	Error      *agentruntime.StructuredError `json:"error,omitempty"`
}

type SavedResources struct {
	Repository grocerystore.LibraryRepository
	Now        func() time.Time
}

func savedResourceTools(repository grocerystore.LibraryRepository) ([]tool.Tool, error) {
	saved := SavedResources{Repository: repository}
	definitions := []struct {
		name        string
		description string
		build       func() (tool.Tool, error)
	}{
		{name: "list_households", description: "List the signed-in user's grocery households so a household name can be resolved to its exact id before saving or retrieving shared resources.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "list_households", Description: "List the signed-in user's grocery households so a household name can be resolved to its exact id before saving or retrieving shared resources."}, saved.ListHouseholds)
		}},
		{name: "save_current_list", description: "Save the current ready list only after the user explicitly asks to save it; omit household_id for the personal library.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "save_current_list", Description: "Save the current ready list only after the user explicitly asks to save it; omit household_id for the personal library."}, saved.SaveCurrentList)
		}},
		{name: "list_saved_lists", description: "List saved personal lists, or lists in one explicitly selected household.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "list_saved_lists", Description: "List saved personal lists, or lists in one explicitly selected household."}, saved.ListSavedLists)
		}},
		{name: "get_saved_list", description: "Load one accessible saved grocery list and all of its items by exact id.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_saved_list", Description: "Load one accessible saved grocery list and all of its items by exact id."}, saved.GetSavedList)
		}},
		{name: "update_saved_list", description: "Rename an accessible saved list and/or replace its complete item set after confirming the target id.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "update_saved_list", Description: "Rename an accessible saved list and/or replace its complete item set after confirming the target id."}, saved.UpdateSavedList)
		}},
		{name: "save_current_recipe", description: "Save the current structured recipe only after the user explicitly asks to save it; omit household_id for the personal library.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "save_current_recipe", Description: "Save the current structured recipe only after the user explicitly asks to save it; omit household_id for the personal library."}, saved.SaveCurrentRecipe)
		}},
		{name: "list_saved_recipes", description: "List saved personal recipes, or recipes in one explicitly selected household.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "list_saved_recipes", Description: "List saved personal recipes, or recipes in one explicitly selected household."}, saved.ListSavedRecipes)
		}},
		{name: "get_saved_recipe", description: "Load one accessible saved structured recipe by exact id.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_saved_recipe", Description: "Load one accessible saved structured recipe by exact id."}, saved.GetSavedRecipe)
		}},
		{name: "update_saved_recipe", description: "Replace the editable content of an accessible saved recipe after confirming the target id.", build: func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "update_saved_recipe", Description: "Replace the editable content of an accessible saved recipe after confirming the target id."}, saved.UpdateSavedRecipe)
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

func (saved SavedResources) ListHouseholds(ctx agent.Context, _ struct{}) (GroceryHouseholdsResult, error) {
	households, err := saved.Repository.ListHouseholds(ctx, strings.TrimSpace(ctx.UserID()))
	if err != nil {
		return GroceryHouseholdsResult{Error: &agentruntime.StructuredError{
			Code: "grocery_households_unavailable", Message: "grocery households are unavailable",
		}}, nil
	}
	return GroceryHouseholdsResult{Households: households}, nil
}

func (saved SavedResources) SaveCurrentList(ctx agent.Context, input SaveCurrentResourceArgs) (SavedListsResult, error) {
	state := readState(ctx.State())
	if state.Status != StatusReady || len(state.ShoppingList) == 0 {
		return savedListFailure("shopping_list_not_ready", "finish and mark a non-empty shopping list ready before saving"), nil
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = strings.TrimSpace(state.ListTitle)
	}
	if title == "" {
		title = "Grocery list"
	}
	list, err := saved.Repository.SaveList(ctx, strings.TrimSpace(ctx.UserID()), grocerystore.SavedListInput{
		HouseholdID: input.HouseholdID, Title: title, Items: groceryListItems(state),
	}, saved.currentTime())
	if err != nil {
		return savedListRepositoryFailure(err), nil
	}
	return SavedListsResult{List: &list}, nil
}

func (saved SavedResources) ListSavedLists(ctx agent.Context, input SavedResourceScopeArgs) (SavedListsResult, error) {
	userID := strings.TrimSpace(ctx.UserID())
	var (
		lists []grocerystore.List
		err   error
	)
	if input.HouseholdID == nil {
		lists, err = saved.Repository.ListPersonalLists(ctx, userID)
	} else {
		lists, err = saved.Repository.ListLists(ctx, userID, strings.TrimSpace(*input.HouseholdID))
	}
	if err != nil {
		return savedListRepositoryFailure(err), nil
	}
	return SavedListsResult{Lists: lists}, nil
}

func (saved SavedResources) GetSavedList(ctx agent.Context, input SavedResourceIDArgs) (SavedListsResult, error) {
	list, err := saved.Repository.GetList(ctx, strings.TrimSpace(ctx.UserID()), strings.TrimSpace(input.ID))
	if err != nil {
		return savedListRepositoryFailure(err), nil
	}
	return SavedListsResult{List: &list}, nil
}

func (saved SavedResources) UpdateSavedList(ctx agent.Context, input UpdateSavedListArgs) (SavedListsResult, error) {
	userID, listID := strings.TrimSpace(ctx.UserID()), strings.TrimSpace(input.ID)
	if userID == "" || listID == "" || (input.Title == nil && input.Items == nil) {
		return savedListFailure("invalid_saved_list", "provide a saved list id and at least one title or item change"), nil
	}
	list, err := saved.Repository.UpdateList(ctx, userID, listID, grocerystore.ListPatch{
		Title: input.Title, Items: input.Items,
	}, saved.currentTime())
	if err != nil {
		return savedListRepositoryFailure(err), nil
	}
	return SavedListsResult{List: &list}, nil
}

func (saved SavedResources) SaveCurrentRecipe(ctx agent.Context, input SaveCurrentResourceArgs) (SavedRecipesResult, error) {
	state := readState(ctx.State())
	if state.Recipe == nil {
		return savedRecipeFailure("recipe_not_ready", "create a complete structured recipe before saving"), nil
	}
	content := recipeContent(*state.Recipe)
	if title := strings.TrimSpace(input.Title); title != "" {
		content.Title = title
	}
	recipe, err := saved.Repository.SaveRecipe(ctx, strings.TrimSpace(ctx.UserID()), grocerystore.SavedRecipeInput{
		HouseholdID: input.HouseholdID, RecipeContent: content,
	}, saved.currentTime())
	if err != nil {
		return savedRecipeRepositoryFailure(err), nil
	}
	return SavedRecipesResult{Recipe: &recipe}, nil
}

func (saved SavedResources) ListSavedRecipes(ctx agent.Context, input SavedResourceScopeArgs) (SavedRecipesResult, error) {
	recipes, err := saved.Repository.ListRecipes(ctx, strings.TrimSpace(ctx.UserID()), input.HouseholdID)
	if err != nil {
		return savedRecipeRepositoryFailure(err), nil
	}
	return SavedRecipesResult{Recipes: recipes}, nil
}

func (saved SavedResources) GetSavedRecipe(ctx agent.Context, input SavedResourceIDArgs) (SavedRecipesResult, error) {
	recipe, err := saved.Repository.GetRecipe(ctx, strings.TrimSpace(ctx.UserID()), strings.TrimSpace(input.ID))
	if err != nil {
		return savedRecipeRepositoryFailure(err), nil
	}
	return SavedRecipesResult{Recipe: &recipe}, nil
}

func (saved SavedResources) UpdateSavedRecipe(ctx agent.Context, input UpdateSavedRecipeArgs) (SavedRecipesResult, error) {
	recipe, err := saved.Repository.UpdateRecipe(ctx, strings.TrimSpace(ctx.UserID()), strings.TrimSpace(input.ID), input.RecipeContent, saved.currentTime())
	if err != nil {
		return savedRecipeRepositoryFailure(err), nil
	}
	return SavedRecipesResult{Recipe: &recipe}, nil
}

func (saved SavedResources) currentTime() time.Time {
	if saved.Now != nil {
		return saved.Now()
	}
	return time.Now()
}

func recipeContent(recipe RecipeDraft) grocerystore.RecipeContent {
	ingredients := make([]grocerystore.NewIngredient, 0, len(recipe.Ingredients))
	for _, ingredient := range recipe.Ingredients {
		ingredients = append(ingredients, grocerystore.NewIngredient{
			Name: ingredient.Name, Quantity: ingredient.Quantity, Unit: ingredient.Unit, Note: ingredient.Note,
		})
	}
	return grocerystore.RecipeContent{
		Title: recipe.Title, Description: recipe.Description, Servings: recipe.Servings, Notes: recipe.Notes,
		Ingredients: ingredients, Steps: append([]string(nil), recipe.Steps...), Tags: append([]string(nil), recipe.Tags...),
	}
}

func groceryListItems(state GroceryState) []grocerystore.NewItem {
	matches := make(map[string]ProductMatch, len(state.ProductMatches))
	for _, match := range state.ProductMatches {
		query := strings.ToLower(strings.TrimSpace(match.Query))
		if query != "" {
			matches[query] = match
		}
	}
	items := make([]grocerystore.NewItem, 0, len(state.ShoppingList))
	for _, raw := range state.ShoppingList {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		quantity := "1"
		if match, ok := matches[strings.ToLower(name)]; ok && strings.TrimSpace(match.Size) != "" {
			quantity = strings.TrimSpace(match.Size)
		}
		items = append(items, grocerystore.NewItem{Name: name, Quantity: quantity})
	}
	return items
}

func savedListRepositoryFailure(err error) SavedListsResult {
	switch {
	case errors.Is(err, grocerystore.ErrForbidden):
		return savedListFailure("saved_list_forbidden", "you do not have access to that list or household")
	case errors.Is(err, grocerystore.ErrNotFound):
		return savedListFailure("saved_list_not_found", "the saved list no longer exists")
	case errors.Is(err, grocerystore.ErrInvalid):
		return savedListFailure("invalid_saved_list", "the saved list values are invalid")
	default:
		return savedListFailure("saved_list_unavailable", "the saved-list library is unavailable")
	}
}

func savedRecipeRepositoryFailure(err error) SavedRecipesResult {
	switch {
	case errors.Is(err, grocerystore.ErrForbidden):
		return savedRecipeFailure("saved_recipe_forbidden", "you do not have access to that recipe or household")
	case errors.Is(err, grocerystore.ErrNotFound):
		return savedRecipeFailure("saved_recipe_not_found", "the saved recipe no longer exists")
	case errors.Is(err, grocerystore.ErrInvalid):
		return savedRecipeFailure("invalid_saved_recipe", "the saved recipe values are invalid")
	default:
		return savedRecipeFailure("saved_recipe_unavailable", "the saved-recipe library is unavailable")
	}
}

func savedListFailure(code, message string) SavedListsResult {
	return SavedListsResult{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}

func savedRecipeFailure(code, message string) SavedRecipesResult {
	return SavedRecipesResult{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
