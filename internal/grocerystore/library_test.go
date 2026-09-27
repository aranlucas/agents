package grocerystore

import (
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
	"google.golang.org/adk/v2/artifact"
)

func TestSaveListCreatesVersionedArtifactBeforeD1Record(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 4 || !strings.Contains(statements[0].SQL, "INSERT INTO grocery_lists") || !strings.Contains(statements[3].SQL, "grocery_resource_artifacts") {
			t.Fatalf("statements = %#v", statements)
		}
		return []storage.Result{mutationResult(1), mutationResult(1), mutationResult(1), mutationResult(1)}
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
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 6 || !strings.Contains(statements[0].SQL, "INSERT INTO recipes") || !strings.Contains(statements[1].SQL, "recipe_ingredients") || !strings.Contains(statements[2].SQL, "recipe_steps") || !strings.Contains(statements[5].SQL, "grocery_resource_artifacts") {
			t.Fatalf("statements = %#v", statements)
		}
		results := make([]storage.Result, len(statements))
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

	recipe, err := store.SaveRecipe(t.Context(), "user_1", SavedRecipeInput{
		Title: "Pasta", Description: "Fast dinner", Servings: "4",
		Ingredients: []NewIngredient{{Name: "Pasta", Quantity: "1", Unit: "lb"}},
		Steps:       []string{"Boil the pasta"}, Tags: []string{"Dinner", "Quick", "quick"},
	}, time.UnixMilli(2_000))
	if err != nil {
		t.Fatal(err)
	}
	if recipe.ArtifactVersion != 1 || len(recipe.Ingredients) != 1 || len(recipe.Steps) != 1 || len(recipe.Tags) != 2 {
		t.Fatalf("recipe = %#v", recipe)
	}
}

func TestRefreshListSnapshotAdvancesR2AndD1Reference(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Updated list", Status: "active", ArtifactVersion: 1, CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, Item{ID: "item_1", ListID: "list_1", Name: "Milk", Quantity: "1", AddedBy: "user_1", UpdatedAt: 2_000}),
			}
		case 2:
			if len(statements) != 1 || !strings.Contains(statements[0].SQL, "ON CONFLICT(resource_type, resource_id) DO UPDATE") {
				t.Fatalf("artifact reference statements = %#v", statements)
			}
			return []storage.Result{mutationResult(1)}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.artifacts = artifact.InMemoryService()
	if _, _, err := store.saveSnapshot(t.Context(), "list", "list_1", "user_1", nil, listArtifactName, List{ID: "list_1", OwnerUserID: "user_1", Title: "Old list"}); err != nil {
		t.Fatal(err)
	}

	list, err := store.refreshListSnapshot(t.Context(), "user_1", "list_1", time.UnixMilli(2_000))
	if err != nil || list.ArtifactVersion != 2 {
		t.Fatalf("list/error = %#v / %v", list, err)
	}
	loaded, err := store.artifacts.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "list_1", FileName: listArtifactName,
	})
	if err != nil || loaded.Part == nil || loaded.Part.InlineData == nil || !strings.Contains(string(loaded.Part.InlineData.Data), `"title":"Updated list"`) {
		t.Fatalf("artifact = %#v, err = %v", loaded, err)
	}
}

func TestRefreshRecipeSnapshotAdvancesR2AndD1Reference(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		switch requests {
		case 1:
			return []storage.Result{
				queryResult(t, Recipe{ID: "recipe_1", OwnerUserID: "user_1", Title: "Pasta", Notes: "Updated", Status: "active", ArtifactVersion: 1, CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t, Ingredient{ID: "ingredient_1", RecipeID: "recipe_1", Name: "Pasta", Quantity: "1", Unit: "lb"}),
				queryResult(t, RecipeStep{ID: "step_1", RecipeID: "recipe_1", Instruction: "Boil"}),
				queryResult(t, map[string]string{"tag": "Dinner"}),
			}
		case 2:
			if len(statements) != 1 || !strings.Contains(statements[0].SQL, "ON CONFLICT(resource_type, resource_id) DO UPDATE") {
				t.Fatalf("artifact reference statements = %#v", statements)
			}
			return []storage.Result{mutationResult(1)}
		default:
			t.Fatalf("unexpected database request %d: %#v", requests, statements)
			return nil
		}
	})
	store.artifacts = artifact.InMemoryService()
	if _, _, err := store.saveSnapshot(t.Context(), "recipe", "recipe_1", "user_1", nil, recipeArtifactName, Recipe{ID: "recipe_1", OwnerUserID: "user_1", Title: "Pasta"}); err != nil {
		t.Fatal(err)
	}

	recipe, err := store.refreshRecipeSnapshot(t.Context(), "user_1", "recipe_1", time.UnixMilli(2_000))
	if err != nil || recipe.ArtifactVersion != 2 {
		t.Fatalf("recipe/error = %#v / %v", recipe, err)
	}
	loaded, err := store.artifacts.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "recipe_1", FileName: recipeArtifactName,
	})
	if err != nil || loaded.Part == nil || loaded.Part.InlineData == nil || !strings.Contains(string(loaded.Part.InlineData.Data), `"notes":"Updated"`) {
		t.Fatalf("artifact = %#v, err = %v", loaded, err)
	}
}
