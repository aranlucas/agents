package grocery

import (
	"context"
	"iter"
	"testing"
	"time"

	"agents/internal/groceries"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestShoppingToolsExposeNativeNames(t *testing.T) {
	tools, err := shoppingResourceTools(&fakeShoppingRepository{})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"get_shopping_profile", "add_to_pantry", "remove_from_pantry", "add_equipment",
		"remove_equipment", "get_recent_orders", "record_order", "get_preferred_store",
		"set_preferred_store",
	}
	if len(tools) != len(want) {
		t.Fatalf("shopping tool count = %d, want %d", len(tools), len(want))
	}
	for index, name := range want {
		if tools[index].Name() != name {
			t.Fatalf("shopping tool %d = %q, want %q", index, tools[index].Name(), name)
		}
	}
}

func TestGroceryLibraryToolsIncludeNativeShoppingTools(t *testing.T) {
	tools, err := groceryLibraryTools(&fakeLibraryShoppingRepository{})
	if err != nil {
		t.Fatal(err)
	}
	seen := make(map[string]bool, len(tools))
	for _, tool := range tools {
		seen[tool.Name()] = true
	}
	for _, name := range []string{"list_households", "save_current_list", "get_shopping_profile", "add_to_pantry", "record_order"} {
		if !seen[name] {
			t.Fatalf("library tool %q missing from %#v", name, seen)
		}
	}
}

func TestNewWithLibraryPublishesNativeShoppingDeclarations(t *testing.T) {
	captured := &captureShoppingModel{}
	built, err := NewWithLibrary(captured, nil, nil, nil, &fakeLibraryShoppingRepository{})
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: AppName, UserID: "user_1", SessionID: "thread_1", State: StateDefaults(),
	}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions})
	if err != nil {
		t.Fatal(err)
	}
	for _, runErr := range run.Run(t.Context(), "user_1", "thread_1", genai.NewContentFromText("show my pantry", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
	}
	if captured.request == nil || captured.request.Config == nil || len(captured.request.Config.Tools) == 0 {
		t.Fatalf("native declarations = %#v", captured.request)
	}
	declarations := captured.request.Config.Tools[0].FunctionDeclarations
	seen := make(map[string]bool, len(declarations))
	for _, declaration := range declarations {
		seen[declaration.Name] = true
	}
	for _, name := range []string{"get_shopping_profile", "add_to_pantry", "record_order"} {
		if !seen[name] {
			t.Fatalf("native declaration %q missing from %#v", name, seen)
		}
	}
}

func TestAddToPantryUsesGatewayRepositoryAndDefaultsQuantity(t *testing.T) {
	expires := "2026-07-20T00:00:00Z"
	repository := &fakeShoppingRepository{pantry: []groceries.PantryItem{{Name: "Eggs", Quantity: 3}}}
	resources := ShoppingResources{Repository: repository, Now: func() time.Time { return time.Unix(100, 0) }}
	ctx := &shoppingContext{StrictContextMock: agent.NewStrictContextMock(t.Context()), userID: "user_1"}
	result, err := resources.AddToPantry(ctx, AddPantryArgs{Items: []PantryItemInput{{Name: "Eggs", ExpiresAt: &expires}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Error != nil || len(result.Items) != 1 || result.Items[0].Quantity != 4 {
		t.Fatalf("result = %#v", result)
	}
	if repository.userID != "user_1" || len(repository.added) != 1 || repository.added[0].Quantity != 1 || repository.added[0].ExpiresAt == nil || *repository.added[0].ExpiresAt != 1784505600 {
		t.Fatalf("repository call = %#v", repository)
	}
}

// shoppingContext overrides only the context method the native tools use;
// StrictContextMock keeps this test aligned with the installed ADK v2 Context
// interface as it evolves.
type shoppingContext struct {
	agent.StrictContextMock
	userID string
}

func (c *shoppingContext) UserID() string { return c.userID }

type fakeShoppingRepository struct {
	groceries.ShoppingRepository
	pantry []groceries.PantryItem
	added  []groceries.PantryItem
	userID string
	addNow time.Time
}

func (f *fakeShoppingRepository) AddPantryItems(_ context.Context, userID string, items []groceries.PantryItem, now time.Time) ([]groceries.PantryItem, error) {
	f.userID, f.addNow = userID, now
	f.added = append([]groceries.PantryItem(nil), items...)
	if len(f.pantry) == 0 {
		f.pantry = append([]groceries.PantryItem(nil), items...)
	} else {
		f.pantry[0].Quantity += items[0].Quantity
	}
	return f.pantry, nil
}

type fakeLibraryShoppingRepository struct {
	groceries.LibraryRepository
	groceries.ShoppingRepository
}

type captureShoppingModel struct {
	request *model.LLMRequest
}

func (*captureShoppingModel) Name() string { return "capture-shopping" }

func (m *captureShoppingModel) GenerateContent(_ context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.request = request
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: genai.NewContentFromText("ok", genai.RoleModel), TurnComplete: true}, nil)
	}
}
