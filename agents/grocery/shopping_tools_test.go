package grocery

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agents/internal/groceries"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
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

func TestAgentShoppingCapabilityControlsNativeAndMCPTools(t *testing.T) {
	httpServer := newShoppingCapabilityServer(t)
	sharedKroger := NewKroger(httpServer.Client(), httpServer.URL)

	libraryCases := []struct {
		name  string
		task  bool
		build func(model.LLM) (agent.Agent, error)
	}{
		{name: "chat", build: func(m model.LLM) (agent.Agent, error) {
			return NewWithLibrary(m, sharedKroger, nil, nil, &fakeLibraryShoppingRepository{})
		}},
		{name: "task", task: true, build: func(m model.LLM) (agent.Agent, error) {
			return NewTaskWithLibrary(m, sharedKroger, nil, nil, &fakeLibraryShoppingRepository{})
		}},
	}
	for _, testCase := range libraryCases {
		t.Run("native_"+testCase.name, func(t *testing.T) {
			captured := &captureShoppingModel{finishTask: testCase.task}
			built, err := testCase.build(captured)
			if err != nil {
				t.Fatal(err)
			}
			var request *model.LLMRequest
			if testCase.task {
				request = runShoppingTaskAgent(t, built, captured)
			} else {
				request = runShoppingAgent(t, built, captured)
			}
			counts := shoppingDeclarationCounts(request)
			for _, name := range []string{
				"get_shopping_profile", "add_to_pantry", "remove_from_pantry", "add_equipment",
				"remove_equipment", "get_recent_orders", "record_order", "get_preferred_store",
				"set_preferred_store", "search_products", "get_weekly_deals",
			} {
				if counts[name] != 1 {
					t.Fatalf("declaration %q count = %d, all = %#v", name, counts[name], counts)
				}
			}
			if counts["add_to_inventory"] != 0 || counts["get_meal_planning_context"] != 0 {
				t.Fatalf("superseded MCP declarations leaked: %#v", counts)
			}
			if instruction := shoppingInstructionText(request); !strings.Contains(instruction, "Use the native `get_shopping_profile`") {
				t.Fatalf("native instruction missing: %q", instruction)
			}
		})
	}

	fallbackCases := []struct {
		name  string
		task  bool
		build func(model.LLM) (agent.Agent, error)
	}{
		{name: "chat", build: func(m model.LLM) (agent.Agent, error) {
			return New(m, sharedKroger, nil, nil)
		}},
		{name: "task", task: true, build: func(m model.LLM) (agent.Agent, error) {
			return NewTask(m, sharedKroger, nil, nil)
		}},
		{name: "library_without_shopping", build: func(m model.LLM) (agent.Agent, error) {
			return NewWithLibrary(m, sharedKroger, nil, nil, &fakeLibraryRepository{})
		}},
	}
	for _, testCase := range fallbackCases {
		t.Run("fallback_"+testCase.name, func(t *testing.T) {
			captured := &captureShoppingModel{finishTask: testCase.task}
			built, err := testCase.build(captured)
			if err != nil {
				t.Fatal(err)
			}
			var request *model.LLMRequest
			if testCase.task {
				request = runShoppingTaskAgent(t, built, captured)
			} else {
				request = runShoppingAgent(t, built, captured)
			}
			counts := shoppingDeclarationCounts(request)
			for _, name := range []string{
				"get_shopping_profile", "add_to_inventory", "get_meal_planning_context",
				"record_order", "set_preferred_store", "search_products", "get_weekly_deals",
			} {
				if counts[name] != 1 {
					t.Fatalf("fallback declaration %q count = %d, all = %#v", name, counts[name], counts)
				}
			}
			if counts["add_to_pantry"] != 0 || counts["get_recent_orders"] != 0 {
				t.Fatalf("unavailable native declarations leaked: %#v", counts)
			}
			if instruction := shoppingInstructionText(request); strings.Contains(instruction, "Use the native `get_shopping_profile`") {
				t.Fatalf("native-only instruction leaked into fallback agent: %q", instruction)
			}
		})
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

type fakeLibraryRepository struct {
	groceries.LibraryRepository
}

type captureShoppingModel struct {
	request    *model.LLMRequest
	finishTask bool
}

func (*captureShoppingModel) Name() string { return "capture-shopping" }

func (m *captureShoppingModel) GenerateContent(_ context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.request = request
	return func(yield func(*model.LLMResponse, error) bool) {
		if m.finishTask {
			yield(&model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{
				ID: "finish-shopping", Name: "finish_task", Args: map[string]any{"result": "done"},
			}}}}}, nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("ok", genai.RoleModel), TurnComplete: true}, nil)
	}
}

type (
	shoppingCapabilityInput  struct{}
	shoppingCapabilityOutput struct{}
)

func shoppingCapabilityTool(context.Context, *mcp.CallToolRequest, shoppingCapabilityInput) (*mcp.CallToolResult, shoppingCapabilityOutput, error) {
	return nil, shoppingCapabilityOutput{}, nil
}

func newShoppingCapabilityServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := mcp.NewServer(&mcp.Implementation{Name: "shopping-capabilities", Version: "1"}, nil)
	for _, name := range []string{
		"get_shopping_profile", "add_to_inventory", "get_meal_planning_context", "record_order",
		"set_preferred_store", "search_products", "get_weekly_deals",
	} {
		mcp.AddTool(server, &mcp.Tool{Name: name, Description: name}, shoppingCapabilityTool)
	}
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true}))
	t.Cleanup(httpServer.Close)
	return httpServer
}

func runShoppingAgent(t *testing.T, built agent.Agent, captured *captureShoppingModel) *model.LLMRequest {
	t.Helper()
	state := StateDefaults()
	state[session.KeyPrefixTemp+"kroger_token"] = "token"
	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: AppName, UserID: "user_1", SessionID: "thread_1", State: state,
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
	if captured.request == nil {
		t.Fatal("model request was not captured")
	}
	return captured.request
}

func runShoppingTaskAgent(t *testing.T, task agent.Agent, captured *captureShoppingModel) *model.LLMRequest {
	t.Helper()
	coordinator, err := llmagent.New(llmagent.Config{
		Name: "shopping_test_coordinator", Model: &shoppingCoordinatorModel{}, Mode: llmagent.ModeChat,
		SubAgents: []agent.Agent{task},
	})
	if err != nil {
		t.Fatal(err)
	}
	state := StateDefaults()
	state[session.KeyPrefixTemp+"kroger_token"] = "token"
	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: "shopping_test_app", UserID: "user_1", SessionID: "thread_1", State: state,
	}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: "shopping_test_app", Agent: coordinator, SessionService: sessions})
	if err != nil {
		t.Fatal(err)
	}
	for _, runErr := range run.Run(t.Context(), "user_1", "thread_1", genai.NewContentFromText("show my pantry", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
	}
	if captured.request == nil {
		t.Fatal("task model request was not captured")
	}
	return captured.request
}

type shoppingCoordinatorModel struct {
	call int
}

func (*shoppingCoordinatorModel) Name() string { return "shopping-coordinator" }

func (m *shoppingCoordinatorModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	call := m.call
	m.call++
	return func(yield func(*model.LLMResponse, error) bool) {
		if call == 0 {
			yield(&model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{
				ID: "delegate-shopping", Name: AppName, Args: map[string]any{"request": "show my pantry"},
			}}}}}, nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func shoppingDeclarationCounts(request *model.LLMRequest) map[string]int {
	counts := map[string]int{}
	if request == nil || request.Config == nil {
		return counts
	}
	for _, configuredTool := range request.Config.Tools {
		if configuredTool == nil {
			continue
		}
		for _, declaration := range configuredTool.FunctionDeclarations {
			if declaration != nil {
				counts[declaration.Name]++
			}
		}
	}
	return counts
}

func shoppingInstructionText(request *model.LLMRequest) string {
	if request == nil || request.Config == nil || request.Config.SystemInstruction == nil {
		return ""
	}
	var instruction strings.Builder
	for _, part := range request.Config.SystemInstruction.Parts {
		if part != nil {
			instruction.WriteString(part.Text)
		}
	}
	return instruction.String()
}
