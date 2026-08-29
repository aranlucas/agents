package groceries

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"strings"
	"time"

	"agents/internal/cloudflare"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

const (
	groceryLibraryApp    = "grocery_library"
	listArtifactName     = "grocery-list.json"
	recipeArtifactName   = "recipe.json"
	maxRecipeIngredients = 200
	maxRecipeSteps       = 100
	maxRecipeTags        = 30
)

type LibraryRepository interface {
	Repository
	SaveList(context.Context, string, SavedListInput, time.Time) (List, error)
	ListPersonalLists(context.Context, string) ([]List, error)
	UpdateList(context.Context, string, string, ListPatch, time.Time) (List, error)
	ReplaceListItems(context.Context, string, string, []NewItem, time.Time) (List, error)
	SaveRecipe(context.Context, string, SavedRecipeInput, time.Time) (Recipe, error)
	ListRecipes(context.Context, string, *string) ([]Recipe, error)
	GetRecipe(context.Context, string, string) (Recipe, error)
	UpdateRecipe(context.Context, string, string, RecipeContent, time.Time) (Recipe, error)
}

type SavedListInput struct {
	HouseholdID *string   `json:"household_id,omitempty"`
	Title       string    `json:"title"`
	Items       []NewItem `json:"items"`
}

type ListPatch struct {
	Title  *string `json:"title,omitempty"`
	Status *string `json:"status,omitempty"`
}

type Recipe struct {
	ID              string       `json:"id"`
	HouseholdID     *string      `json:"household_id"`
	OwnerUserID     string       `json:"owner_user_id"`
	Title           string       `json:"title"`
	Description     string       `json:"description"`
	Servings        string       `json:"servings"`
	Notes           string       `json:"notes"`
	Status          string       `json:"status"`
	ArtifactVersion int64        `json:"artifact_version,omitzero"`
	CreatedAt       int64        `json:"created_at"`
	UpdatedAt       int64        `json:"updated_at"`
	Ingredients     []Ingredient `json:"ingredients"`
	Steps           []RecipeStep `json:"steps"`
	Tags            []string     `json:"tags"`
}

type Ingredient struct {
	ID       string `json:"id"`
	RecipeID string `json:"recipe_id"`
	Name     string `json:"name"`
	Quantity string `json:"quantity"`
	Unit     string `json:"unit"`
	Note     string `json:"note"`
	Position int    `json:"position"`
}

type RecipeStep struct {
	ID          string `json:"id"`
	RecipeID    string `json:"recipe_id"`
	Instruction string `json:"instruction"`
	Position    int    `json:"position"`
}

type NewIngredient struct {
	Name     string `json:"name"`
	Quantity string `json:"quantity,omitempty"`
	Unit     string `json:"unit,omitempty"`
	Note     string `json:"note,omitempty"`
}

type RecipeContent struct {
	Title       string          `json:"title"`
	Description string          `json:"description,omitempty"`
	Servings    string          `json:"servings,omitempty"`
	Notes       string          `json:"notes,omitempty"`
	Ingredients []NewIngredient `json:"ingredients"`
	Steps       []string        `json:"steps"`
	Tags        []string        `json:"tags,omitempty"`
}

type SavedRecipeInput struct {
	HouseholdID *string `json:"household_id,omitempty"`
	RecipeContent
}

func (s *Store) SaveList(ctx context.Context, userID string, input SavedListInput, now time.Time) (List, error) {
	if err := s.libraryReady(); err != nil {
		return List{}, err
	}
	userID, title := strings.TrimSpace(userID), strings.TrimSpace(input.Title)
	if userID == "" || title == "" || len(title) > 120 || len(input.Items) > maxBatchItems {
		return List{}, ErrInvalid
	}
	householdID, err := s.authorizedHousehold(ctx, userID, input.HouseholdID)
	if err != nil {
		return List{}, err
	}
	id, err := s.newID("list")
	if err != nil {
		return List{}, err
	}
	createdAt := timestamp(now)
	list := List{ID: id, HouseholdID: householdID, OwnerUserID: userID, Title: title, Status: "active", CreatedAt: createdAt, UpdatedAt: createdAt, Items: make([]Item, 0, len(input.Items))}
	statements := make([]cloudflare.Statement, 0, len(input.Items)+2)
	statements = append(statements, cloudflare.Statement{
		SQL:    `INSERT INTO grocery_lists (id, household_id, owner_user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
		Params: []any{id, nullableString(householdID), userID, title, createdAt, createdAt},
	})
	for position, raw := range input.Items {
		item, itemErr := s.newListItem(id, userID, raw, position, createdAt)
		if itemErr != nil {
			return List{}, itemErr
		}
		list.Items = append(list.Items, item)
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO grocery_list_items (id, list_id, name, quantity, note, position, added_by, checked_by, checked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
			Params: []any{item.ID, id, item.Name, item.Quantity, nullableString(item.Note), position, userID, createdAt},
		})
		if stmt := productReferenceStatement(item.ID, item.Product); stmt != nil {
			statements = append(statements, *stmt)
		}
	}
	version, scopeUserID, err := s.saveSnapshot(ctx, "list", id, userID, householdID, listArtifactName, list)
	if err != nil {
		return List{}, err
	}
	list.ArtifactVersion = version
	statements = append(statements, artifactReferenceStatement("list", id, scopeUserID, listArtifactName, version, createdAt))
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return List{}, fmt.Errorf("save grocery list: %w", err)
	}
	return list, nil
}

func (s *Store) ListPersonalLists(ctx context.Context, userID string) ([]List, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalid
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT gl.id, gl.household_id, gl.owner_user_id, gl.title, gl.status, gl.created_at, gl.updated_at,
		             COALESCE((SELECT version FROM grocery_resource_artifacts gra WHERE gra.resource_type = 'list' AND gra.resource_id = gl.id), 0) AS artifact_version
		      FROM grocery_lists gl WHERE gl.owner_user_id = ? AND gl.household_id IS NULL
		      ORDER BY gl.updated_at DESC, gl.id`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("list personal grocery lists: %w", err)
	}
	lists := []List{}
	if len(results) == 0 {
		return lists, nil
	}
	for _, raw := range results[0].Rows {
		list, decodeErr := decodeList(raw)
		if decodeErr != nil {
			return nil, decodeErr
		}
		list.Items = []Item{}
		lists = append(lists, list)
	}
	return lists, nil
}

func (s *Store) UpdateList(ctx context.Context, userID, listID string, patch ListPatch, now time.Time) (List, error) {
	if err := s.ready(); err != nil {
		return List{}, err
	}
	userID, listID = strings.TrimSpace(userID), strings.TrimSpace(listID)
	sets := []string{}
	params := []any{}
	if patch.Title != nil {
		title := strings.TrimSpace(*patch.Title)
		if title == "" || len(title) > 120 {
			return List{}, ErrInvalid
		}
		sets, params = append(sets, "title = ?"), append(params, title)
	}
	if patch.Status != nil {
		status := strings.TrimSpace(*patch.Status)
		if status != "active" && status != "archived" {
			return List{}, ErrInvalid
		}
		sets, params = append(sets, "status = ?"), append(params, status)
	}
	if userID == "" || listID == "" || len(sets) == 0 {
		return List{}, ErrInvalid
	}
	sets, params = append(sets, "updated_at = ?"), append(params, timestamp(now))
	params = append(params, listID, userID, userID)
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `UPDATE grocery_lists SET ` + strings.Join(sets, ", ") + ` WHERE id = ? AND (owner_user_id = ? OR EXISTS (
		      SELECT 1 FROM household_members hm WHERE hm.household_id = grocery_lists.household_id AND hm.clerk_user_id = ?
		    ))`,
		Params: params,
	})
	if err != nil {
		return List{}, fmt.Errorf("update grocery list: %w", err)
	}
	if changed(results) == 0 {
		return List{}, ErrNotFound
	}
	return s.refreshListSnapshot(ctx, userID, listID, now)
}

func (s *Store) ReplaceListItems(ctx context.Context, userID, listID string, inputs []NewItem, now time.Time) (List, error) {
	if err := s.ready(); err != nil {
		return List{}, err
	}
	userID, listID = strings.TrimSpace(userID), strings.TrimSpace(listID)
	if userID == "" || listID == "" || len(inputs) > maxBatchItems {
		return List{}, ErrInvalid
	}
	allowed, err := s.CanAccessList(ctx, userID, listID)
	if err != nil {
		return List{}, err
	}
	if !allowed {
		return List{}, ErrNotFound
	}
	updatedAt := timestamp(now)
	statements := []cloudflare.Statement{
		{SQL: `DELETE FROM grocery_list_item_upcs WHERE item_id IN (SELECT id FROM grocery_list_items WHERE list_id = ?)`, Params: []any{listID}},
		{SQL: `DELETE FROM grocery_list_item_product_refs WHERE item_id IN (SELECT id FROM grocery_list_items WHERE list_id = ?)`, Params: []any{listID}},
		{SQL: `DELETE FROM grocery_list_items WHERE list_id = ?`, Params: []any{listID}},
	}
	for position, raw := range inputs {
		item, itemErr := s.newListItem(listID, userID, raw, position, updatedAt)
		if itemErr != nil {
			return List{}, itemErr
		}
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO grocery_list_items (id, list_id, name, quantity, note, position, added_by, checked_by, checked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
			Params: []any{item.ID, listID, item.Name, item.Quantity, nullableString(item.Note), position, userID, updatedAt},
		})
		if stmt := productReferenceStatement(item.ID, item.Product); stmt != nil {
			statements = append(statements, *stmt)
		}
	}
	statements = append(statements, cloudflare.Statement{SQL: `UPDATE grocery_lists SET updated_at = ? WHERE id = ?`, Params: []any{updatedAt, listID}})
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return List{}, fmt.Errorf("replace grocery list items: %w", err)
	}
	return s.refreshListSnapshot(ctx, userID, listID, now)
}

func (s *Store) SaveRecipe(ctx context.Context, userID string, input SavedRecipeInput, now time.Time) (Recipe, error) {
	if err := s.libraryReady(); err != nil {
		return Recipe{}, err
	}
	userID = strings.TrimSpace(userID)
	content, err := normalizeRecipeContent(input.RecipeContent)
	if err != nil || userID == "" {
		return Recipe{}, ErrInvalid
	}
	householdID, err := s.authorizedHousehold(ctx, userID, input.HouseholdID)
	if err != nil {
		return Recipe{}, err
	}
	id, err := s.newID("recipe")
	if err != nil {
		return Recipe{}, err
	}
	createdAt := timestamp(now)
	recipe, statements, err := s.materializeRecipe(id, userID, householdID, content, createdAt)
	if err != nil {
		return Recipe{}, err
	}
	version, scopeUserID, err := s.saveSnapshot(ctx, "recipe", id, userID, householdID, recipeArtifactName, recipe)
	if err != nil {
		return Recipe{}, err
	}
	recipe.ArtifactVersion = version
	statements = append(statements, artifactReferenceStatement("recipe", id, scopeUserID, recipeArtifactName, version, createdAt))
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return Recipe{}, fmt.Errorf("save recipe: %w", err)
	}
	return recipe, nil
}

func (s *Store) ListRecipes(ctx context.Context, userID string, householdID *string) ([]Recipe, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalid
	}
	var statement cloudflare.Statement
	if householdID == nil {
		statement = cloudflare.Statement{
			SQL:    recipeSelect + ` WHERE r.owner_user_id = ? AND r.household_id IS NULL ORDER BY r.updated_at DESC, r.id`,
			Params: []any{userID},
		}
	} else {
		household := strings.TrimSpace(*householdID)
		if household == "" {
			return nil, ErrInvalid
		}
		member, err := s.IsMember(ctx, userID, household)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrForbidden
		}
		statement = cloudflare.Statement{
			SQL:    recipeSelect + ` WHERE r.household_id = ? ORDER BY r.updated_at DESC, r.id`,
			Params: []any{household},
		}
	}
	results, err := s.d1.Run(ctx, statement)
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}
	recipes := []Recipe{}
	if len(results) == 0 {
		return recipes, nil
	}
	for _, raw := range results[0].Rows {
		recipe, decodeErr := decodeRecipe(raw)
		if decodeErr != nil {
			return nil, decodeErr
		}
		recipe.Ingredients, recipe.Steps, recipe.Tags = []Ingredient{}, []RecipeStep{}, []string{}
		recipes = append(recipes, recipe)
	}
	return recipes, nil
}

func (s *Store) GetRecipe(ctx context.Context, userID, recipeID string) (Recipe, error) {
	if err := s.ready(); err != nil {
		return Recipe{}, err
	}
	userID, recipeID = strings.TrimSpace(userID), strings.TrimSpace(recipeID)
	if userID == "" || recipeID == "" {
		return Recipe{}, ErrInvalid
	}
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: recipeSelect + ` WHERE r.id = ? AND (r.owner_user_id = ? OR EXISTS (
			      SELECT 1 FROM household_members hm WHERE hm.household_id = r.household_id AND hm.clerk_user_id = ?
			    )) LIMIT 1`,
			Params: []any{recipeID, userID, userID},
		},
		cloudflare.Statement{SQL: `SELECT id, recipe_id, name, quantity, unit, note, position FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id`, Params: []any{recipeID}},
		cloudflare.Statement{SQL: `SELECT id, recipe_id, instruction, position FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id`, Params: []any{recipeID}},
		cloudflare.Statement{SQL: `SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY position, tag`, Params: []any{recipeID}},
	)
	if err != nil {
		return Recipe{}, fmt.Errorf("load recipe: %w", err)
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return Recipe{}, ErrNotFound
	}
	recipe, err := decodeRecipe(results[0].Rows[0])
	if err != nil {
		return Recipe{}, err
	}
	recipe.Ingredients, recipe.Steps, recipe.Tags = []Ingredient{}, []RecipeStep{}, []string{}
	if len(results) > 1 {
		for _, raw := range results[1].Rows {
			var ingredient Ingredient
			if json.Unmarshal(raw, &ingredient) != nil || ingredient.ID == "" || ingredient.Name == "" {
				return Recipe{}, errors.New("decode recipe ingredient")
			}
			recipe.Ingredients = append(recipe.Ingredients, ingredient)
		}
	}
	if len(results) > 2 {
		for _, raw := range results[2].Rows {
			var step RecipeStep
			if json.Unmarshal(raw, &step) != nil || step.ID == "" || step.Instruction == "" {
				return Recipe{}, errors.New("decode recipe step")
			}
			recipe.Steps = append(recipe.Steps, step)
		}
	}
	if len(results) > 3 {
		for _, raw := range results[3].Rows {
			var row struct {
				Tag string `json:"tag"`
			}
			if json.Unmarshal(raw, &row) != nil || row.Tag == "" {
				return Recipe{}, errors.New("decode recipe tag")
			}
			recipe.Tags = append(recipe.Tags, row.Tag)
		}
	}
	return recipe, nil
}

func (s *Store) UpdateRecipe(ctx context.Context, userID, recipeID string, input RecipeContent, now time.Time) (Recipe, error) {
	if err := s.ready(); err != nil {
		return Recipe{}, err
	}
	userID, recipeID = strings.TrimSpace(userID), strings.TrimSpace(recipeID)
	content, err := normalizeRecipeContent(input)
	if err != nil || userID == "" || recipeID == "" {
		return Recipe{}, ErrInvalid
	}
	existing, err := s.GetRecipe(ctx, userID, recipeID)
	if err != nil {
		return Recipe{}, err
	}
	updatedAt := timestamp(now)
	statements := []cloudflare.Statement{
		{SQL: `UPDATE recipes SET title = ?, description = ?, servings = ?, notes = ?, updated_at = ? WHERE id = ?`, Params: []any{content.Title, content.Description, content.Servings, content.Notes, updatedAt, recipeID}},
		{SQL: `DELETE FROM recipe_ingredients WHERE recipe_id = ?`, Params: []any{recipeID}},
		{SQL: `DELETE FROM recipe_steps WHERE recipe_id = ?`, Params: []any{recipeID}},
		{SQL: `DELETE FROM recipe_tags WHERE recipe_id = ?`, Params: []any{recipeID}},
	}
	_, replacement, err := s.materializeRecipe(recipeID, existing.OwnerUserID, existing.HouseholdID, content, updatedAt)
	if err != nil {
		return Recipe{}, err
	}
	statements = append(statements, replacement[1:]...)
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return Recipe{}, fmt.Errorf("update recipe: %w", err)
	}
	return s.refreshRecipeSnapshot(ctx, userID, recipeID, now)
}

const recipeSelect = `SELECT r.id, r.household_id, r.owner_user_id, r.title, r.description, r.servings, r.notes, r.status, r.created_at, r.updated_at,
       COALESCE((SELECT version FROM grocery_resource_artifacts gra WHERE gra.resource_type = 'recipe' AND gra.resource_id = r.id), 0) AS artifact_version
       FROM recipes r`

func (s *Store) materializeRecipe(id, userID string, householdID *string, content RecipeContent, updatedAt int64) (Recipe, []cloudflare.Statement, error) {
	recipe := Recipe{
		ID: id, HouseholdID: householdID, OwnerUserID: userID, Title: content.Title, Description: content.Description,
		Servings: content.Servings, Notes: content.Notes, Status: "active", CreatedAt: updatedAt, UpdatedAt: updatedAt,
		Ingredients: make([]Ingredient, 0, len(content.Ingredients)), Steps: make([]RecipeStep, 0, len(content.Steps)), Tags: append([]string(nil), content.Tags...),
	}
	statements := []cloudflare.Statement{{
		SQL:    `INSERT INTO recipes (id, household_id, owner_user_id, title, description, servings, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		Params: []any{id, nullableString(householdID), userID, content.Title, content.Description, content.Servings, content.Notes, updatedAt, updatedAt},
	}}
	for position, input := range content.Ingredients {
		ingredientID, err := s.newID("ingredient")
		if err != nil {
			return Recipe{}, nil, err
		}
		ingredient := Ingredient{ID: ingredientID, RecipeID: id, Name: input.Name, Quantity: input.Quantity, Unit: input.Unit, Note: input.Note, Position: position}
		recipe.Ingredients = append(recipe.Ingredients, ingredient)
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO recipe_ingredients (id, recipe_id, name, quantity, unit, note, position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			Params: []any{ingredientID, id, input.Name, input.Quantity, input.Unit, input.Note, position},
		})
	}
	for position, instruction := range content.Steps {
		stepID, err := s.newID("step")
		if err != nil {
			return Recipe{}, nil, err
		}
		step := RecipeStep{ID: stepID, RecipeID: id, Instruction: instruction, Position: position}
		recipe.Steps = append(recipe.Steps, step)
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO recipe_steps (id, recipe_id, instruction, position) VALUES (?, ?, ?, ?)`,
			Params: []any{stepID, id, instruction, position},
		})
	}
	for position, tag := range content.Tags {
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO recipe_tags (recipe_id, tag, position) VALUES (?, ?, ?)`,
			Params: []any{id, tag, position},
		})
	}
	return recipe, statements, nil
}

func normalizeRecipeContent(input RecipeContent) (RecipeContent, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Servings = strings.TrimSpace(input.Servings)
	input.Notes = strings.TrimSpace(input.Notes)
	if input.Title == "" || len(input.Title) > 200 || len(input.Description) > 4_000 || len(input.Servings) > 100 || len(input.Notes) > 10_000 || len(input.Ingredients) == 0 || len(input.Ingredients) > maxRecipeIngredients || len(input.Steps) == 0 || len(input.Steps) > maxRecipeSteps || len(input.Tags) > maxRecipeTags {
		return RecipeContent{}, ErrInvalid
	}
	for index := range input.Ingredients {
		ingredient := &input.Ingredients[index]
		ingredient.Name, ingredient.Quantity = strings.TrimSpace(ingredient.Name), strings.TrimSpace(ingredient.Quantity)
		ingredient.Unit, ingredient.Note = strings.TrimSpace(ingredient.Unit), strings.TrimSpace(ingredient.Note)
		if ingredient.Name == "" || len(ingredient.Name) > 500 || len(ingredient.Quantity) > 100 || len(ingredient.Unit) > 100 || len(ingredient.Note) > 1_000 {
			return RecipeContent{}, ErrInvalid
		}
	}
	for index, step := range input.Steps {
		input.Steps[index] = strings.TrimSpace(step)
		if input.Steps[index] == "" || len(input.Steps[index]) > 10_000 {
			return RecipeContent{}, ErrInvalid
		}
	}
	seen := map[string]bool{}
	tags := make([]string, 0, len(input.Tags))
	for _, raw := range input.Tags {
		tag := strings.TrimSpace(raw)
		key := strings.ToLower(tag)
		if tag == "" || len(tag) > 100 {
			return RecipeContent{}, ErrInvalid
		}
		if !seen[key] {
			seen[key] = true
			tags = append(tags, tag)
		}
	}
	input.Tags = tags
	return input, nil
}

func (s *Store) authorizedHousehold(ctx context.Context, userID string, requested *string) (*string, error) {
	if requested == nil {
		return nil, nil
	}
	householdID := strings.TrimSpace(*requested)
	if householdID == "" {
		return nil, ErrInvalid
	}
	member, err := s.IsMember(ctx, userID, householdID)
	if err != nil {
		return nil, err
	}
	if !member {
		return nil, ErrForbidden
	}
	return &householdID, nil
}

func (s *Store) libraryReady() error {
	if err := s.ready(); err != nil {
		return err
	}
	if s.artifacts == nil {
		return errors.New("grocery artifact service is required")
	}
	return nil
}

func (s *Store) saveSnapshot(ctx context.Context, resourceType, resourceID, userID string, householdID *string, fileName string, value any) (int64, string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return 0, "", errors.New("encode grocery artifact")
	}
	scopeUserID := userID
	if householdID != nil {
		scopeUserID = "household_" + *householdID
	}
	response, err := s.artifacts.Save(ctx, &artifact.SaveRequest{
		AppName: groceryLibraryApp, UserID: scopeUserID, SessionID: resourceID, FileName: fileName,
		Part: &genai.Part{InlineData: &genai.Blob{Data: data, MIMEType: "application/json"}},
	})
	if err != nil {
		return 0, "", fmt.Errorf("save grocery artifact: %w", err)
	}
	if response == nil || response.Version <= 0 {
		return 0, "", errors.New("save grocery artifact: invalid version")
	}
	return response.Version, scopeUserID, nil
}

func (s *Store) refreshListSnapshot(ctx context.Context, userID, listID string, now time.Time) (List, error) {
	list, err := s.GetList(ctx, userID, listID)
	if err != nil {
		return List{}, err
	}
	if list.ArtifactVersion == 0 {
		return list, nil
	}
	snapshot := list
	snapshot.ArtifactVersion = 0
	version, scopeUserID, err := s.saveSnapshot(ctx, "list", list.ID, list.OwnerUserID, list.HouseholdID, listArtifactName, snapshot)
	if err != nil {
		return List{}, err
	}
	if _, err := s.d1.Run(ctx, artifactReferenceUpsertStatement("list", list.ID, scopeUserID, listArtifactName, version, timestamp(now))); err != nil {
		return List{}, fmt.Errorf("update grocery list artifact reference: %w", err)
	}
	list.ArtifactVersion = version
	return list, nil
}

func (s *Store) refreshRecipeSnapshot(ctx context.Context, userID, recipeID string, now time.Time) (Recipe, error) {
	recipe, err := s.GetRecipe(ctx, userID, recipeID)
	if err != nil {
		return Recipe{}, err
	}
	if recipe.ArtifactVersion == 0 {
		return recipe, nil
	}
	snapshot := recipe
	snapshot.ArtifactVersion = 0
	version, scopeUserID, err := s.saveSnapshot(ctx, "recipe", recipe.ID, recipe.OwnerUserID, recipe.HouseholdID, recipeArtifactName, snapshot)
	if err != nil {
		return Recipe{}, err
	}
	if _, err := s.d1.Run(ctx, artifactReferenceUpsertStatement("recipe", recipe.ID, scopeUserID, recipeArtifactName, version, timestamp(now))); err != nil {
		return Recipe{}, fmt.Errorf("update recipe artifact reference: %w", err)
	}
	recipe.ArtifactVersion = version
	return recipe, nil
}

func (s *Store) newListItem(listID, userID string, input NewItem, position int, updatedAt int64) (Item, error) {
	name, quantity := strings.TrimSpace(input.Name), strings.TrimSpace(input.Quantity)
	if quantity == "" {
		quantity = defaultQuantity
	}
	if name == "" || len(name) > 500 || len(quantity) > 100 {
		return Item{}, ErrInvalid
	}
	var note *string
	if input.Note != nil {
		trimmed := strings.TrimSpace(*input.Note)
		if len(trimmed) > 1_000 {
			return Item{}, ErrInvalid
		}
		if trimmed != "" {
			note = &trimmed
		}
	}
	product, upc, productErr := normalizeProductReference(input.Product, input.Upc)
	if productErr != nil {
		return Item{}, productErr
	}
	id, err := s.newID("item")
	if err != nil {
		return Item{}, err
	}
	return Item{ID: id, ListID: listID, Name: name, Quantity: quantity, Note: note, Upc: upc, Product: product, Position: position, AddedBy: userID, UpdatedAt: updatedAt}, nil
}

func decodeRecipe(raw jsontext.Value) (Recipe, error) {
	var recipe Recipe
	if json.Unmarshal(raw, &recipe) != nil || recipe.ID == "" || recipe.OwnerUserID == "" || recipe.Title == "" {
		return Recipe{}, errors.New("decode recipe")
	}
	return recipe, nil
}

func nullableString(value any) any {
	switch typed := value.(type) {
	case *string:
		if typed == nil || strings.TrimSpace(*typed) == "" {
			return nil
		}
		return strings.TrimSpace(*typed)
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return strings.TrimSpace(typed)
	default:
		return nil
	}
}

func artifactReferenceStatement(resourceType, resourceID, scopeUserID, fileName string, version, createdAt int64) cloudflare.Statement {
	return cloudflare.Statement{
		SQL:    `INSERT INTO grocery_resource_artifacts (resource_type, resource_id, scope_user_id, file_name, version, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		Params: []any{resourceType, resourceID, scopeUserID, fileName, version, createdAt},
	}
}

func artifactReferenceUpsertStatement(resourceType, resourceID, scopeUserID, fileName string, version, createdAt int64) cloudflare.Statement {
	return cloudflare.Statement{
		SQL: `INSERT INTO grocery_resource_artifacts (resource_type, resource_id, scope_user_id, file_name, version, created_at)
		      VALUES (?, ?, ?, ?, ?, ?)
		      ON CONFLICT(resource_type, resource_id) DO UPDATE SET
		        scope_user_id = excluded.scope_user_id,
		        file_name = excluded.file_name,
		        version = excluded.version,
		        created_at = excluded.created_at`,
		Params: []any{resourceType, resourceID, scopeUserID, fileName, version, createdAt},
	}
}
