package groceries

import (
	"strings"
	"testing"
	"time"

	"agents/internal/cloudflare"
	"google.golang.org/adk/v2/artifact"
)

func TestSaveListCreatesVersionedArtifactBeforeD1Record(t *testing.T) {
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 4 || !strings.Contains(statements[0].SQL, "INSERT INTO grocery_lists") || !strings.Contains(statements[3].SQL, "grocery_resource_artifacts") {
			t.Fatalf("statements = %#v", statements)
		}
		return []cloudflare.Result{mutationResult(1), mutationResult(1), mutationResult(1), mutationResult(1)}
	})
	store.artifacts = artifact.InMemoryService()
	ids := []string{"list_1", "item_1", "item_2"}
	store.newID = func(string) (string, error) {
		id := ids[0]
		ids = ids[1:]
		return id, nil
	}

	list, err := store.SaveList(t.Context(), "user_1", SavedListInput{
		Title: "Weekend", Items: []NewItem{{Name: "Milk"}, {Name: "Eggs", Quantity: "12"}},
	}, time.UnixMilli(1_000))
	if err != nil {
		t.Fatal(err)
	}
	if list.ID != "list_1" || list.ArtifactVersion != 1 || len(list.Items) != 2 || list.Items[1].Quantity != "12" {
		t.Fatalf("list = %#v", list)
	}
	loaded, err := store.artifacts.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "list_1", FileName: listArtifactName,
	})
	if err != nil || loaded.Part == nil || loaded.Part.InlineData == nil || !strings.Contains(string(loaded.Part.InlineData.Data), `"title":"Weekend"`) {
		t.Fatalf("artifact = %#v, err = %v", loaded, err)
	}
}

func TestSaveRecipePersistsStructuredRowsAndArtifactReference(t *testing.T) {
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 6 || !strings.Contains(statements[0].SQL, "INSERT INTO recipes") || !strings.Contains(statements[1].SQL, "recipe_ingredients") || !strings.Contains(statements[2].SQL, "recipe_steps") || !strings.Contains(statements[5].SQL, "grocery_resource_artifacts") {
			t.Fatalf("statements = %#v", statements)
		}
		results := make([]cloudflare.Result, len(statements))
		for index := range results {
			results[index] = mutationResult(1)
		}
		return results
	})
	store.artifacts = artifact.InMemoryService()
	ids := []string{"recipe_1", "ingredient_1", "step_1"}
	store.newID = func(string) (string, error) {
		id := ids[0]
		ids = ids[1:]
		return id, nil
	}

	recipe, err := store.SaveRecipe(t.Context(), "user_1", SavedRecipeInput{RecipeContent: RecipeContent{
		Title: "Pasta", Description: "Fast dinner", Servings: "4",
		Ingredients: []NewIngredient{{Name: "Pasta", Quantity: "1", Unit: "lb"}},
		Steps:       []string{"Boil the pasta"}, Tags: []string{"Dinner", "Quick", "quick"},
	}}, time.UnixMilli(2_000))
	if err != nil {
		t.Fatal(err)
	}
	if recipe.ArtifactVersion != 1 || len(recipe.Ingredients) != 1 || len(recipe.Steps) != 1 || len(recipe.Tags) != 2 {
		t.Fatalf("recipe = %#v", recipe)
	}
}
