package grocery

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/grocerystore"

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
	repository := &fakeShoppingRepository{pantry: []grocerystore.PantryItem{{Name: "Eggs", Quantity: 3}}}
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
	state := readState(ctx.ReadonlyState())
	if len(state.ShoppingProfile.Pantry) != 1 || state.ShoppingProfile.Pantry[0].Quantity != 4 {
		t.Fatalf("projected state = %#v", state)
	}
}

func TestNativeShoppingToolsEmitCompleteProfileState(t *testing.T) {
	store := &grocerystore.PreferredStore{LocationID: "store_1", Name: "QFC", Address: "1 Main", Chain: "QFC", SetAt: 50}
	baseline := grocerystore.ShoppingProfile{
		PreferredStore: store,
		Pantry:         []grocerystore.PantryItem{{Name: "Eggs", Quantity: 2, AddedAt: 10}},
		Equipment:      []grocerystore.EquipmentItem{{Name: "Oven", AddedAt: 11}},
		RecentOrders: []grocerystore.Order{
			{ID: "order_2", Items: []grocerystore.OrderItem{{UPC: "2", Name: "Milk", Quantity: 1}}, TotalItems: 1, PlacedAt: 20},
			{ID: "order_1", Items: []grocerystore.OrderItem{{UPC: "1", Name: "Bread", Quantity: 1}}, TotalItems: 1, PlacedAt: 10},
		},
		FrequentItems: []grocerystore.FrequentItem{{Name: "Milk", UPC: "2", Orders: 2, TotalQuantity: 2}},
	}
	tests := []struct {
		name   string
		invoke func(ShoppingResources, agent.Context) (bool, error)
	}{
		{name: "get_shopping_profile", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.GetShoppingProfile(ctx, struct{}{})
			return result.Error == nil, err
		}},
		{name: "add_to_pantry", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.AddToPantry(ctx, AddPantryArgs{Items: []PantryItemInput{{Name: "Milk"}}})
			return result.Error == nil, err
		}},
		{name: "remove_from_pantry", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.RemoveFromPantry(ctx, RemovePantryArgs{Names: []string{"Eggs"}})
			return result.Error == nil, err
		}},
		{name: "add_equipment", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.AddEquipment(ctx, EquipmentArgs{Items: []EquipmentItemInput{{Name: "Blender"}}})
			return result.Error == nil, err
		}},
		{name: "remove_equipment", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.RemoveEquipment(ctx, RemoveEquipmentArgs{Names: []string{"Oven"}})
			return result.Error == nil, err
		}},
		{name: "get_recent_orders", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.GetRecentOrders(ctx, RecentOrdersArgs{Limit: 1})
			return result.Error == nil, err
		}},
		{name: "record_order", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.RecordOrder(ctx, RecordOrderArgs{Items: []grocerystore.OrderItem{{UPC: "3", Name: "Apples", Quantity: 2}}})
			return result.Error == nil, err
		}},
		{name: "get_preferred_store", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.GetPreferredStore(ctx, struct{}{})
			return result.Error == nil, err
		}},
		{name: "set_preferred_store", invoke: func(resources ShoppingResources, ctx agent.Context) (bool, error) {
			result, err := resources.SetPreferredStore(ctx, PreferredStoreArgs{LocationID: "store_2", Name: "Kroger", Address: "2 Main", Chain: "Kroger"})
			return result.Error == nil, err
		}},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			repository := &fakeShoppingRepository{profile: baseline}
			state := &trackingShoppingState{mutableGroceryState: mutableGroceryState(StateDefaults())}
			ctx := &shoppingContext{StrictContextMock: agent.NewStrictContextMock(t.Context()), userID: "user_1", state: state}
			if err := writeShoppingProfileState(ctx, baseline); err != nil {
				t.Fatal(err)
			}
			state.writes = nil
			ok, err := testCase.invoke(ShoppingResources{Repository: repository, Now: func() time.Time { return time.Unix(100, 0) }}, ctx)
			if err != nil || !ok {
				t.Fatalf("invoke ok/error = %v / %v", ok, err)
			}
			if !state.wrote("shopping_profile") || state.wrote("pantry") {
				t.Fatalf("state writes = %#v", state.writes)
			}
			wantProfileCalls := 0
			if testCase.name == "get_shopping_profile" || testCase.name == "record_order" {
				wantProfileCalls = 1
			}
			if repository.profileCalls != wantProfileCalls {
				t.Fatalf("ShoppingProfile calls = %d, want %d", repository.profileCalls, wantProfileCalls)
			}
			projected := readState(ctx.ReadonlyState())
			if testCase.name == "get_recent_orders" && len(projected.ShoppingProfile.RecentOrders) != 2 {
				t.Fatalf("limited order read truncated profile: %#v", projected.ShoppingProfile.RecentOrders)
			}
		})
	}
}

func TestSetPreferredStoreNoOpKeepsCanonicalTimestampInState(t *testing.T) {
	repository := &fakeShoppingRepository{}
	state := &trackingShoppingState{mutableGroceryState: mutableGroceryState(StateDefaults())}
	ctx := &shoppingContext{StrictContextMock: agent.NewStrictContextMock(t.Context()), userID: "user_1", state: state}
	now := time.Unix(2, 0)
	resources := ShoppingResources{Repository: repository, Now: func() time.Time { return now }}
	input := PreferredStoreArgs{LocationID: "store_1", Name: "Market", Address: "1 Main", Chain: "Kroger"}

	first, err := resources.SetPreferredStore(ctx, input)
	if err != nil || first.Error != nil || first.Store == nil {
		t.Fatalf("first preferred store = %#v, err = %v", first, err)
	}
	now = time.Unix(3_602, 0)
	second, err := resources.SetPreferredStore(ctx, input)
	if err != nil || second.Error != nil || second.Store == nil {
		t.Fatalf("second preferred store = %#v, err = %v", second, err)
	}
	projected := readState(ctx.ReadonlyState()).ShoppingProfile.PreferredStore
	if first.Store.SetAt != 2 || second.Store.SetAt != first.Store.SetAt || projected == nil || projected.SetAt != first.Store.SetAt {
		t.Fatalf("canonical preferred store/state = %#v / %#v / %#v", first.Store, second.Store, projected)
	}
}

func TestShoppingToolRunnerPersistsToolStateDelta(t *testing.T) {
	repository := &fakeLibraryShoppingRepository{profile: grocerystore.ShoppingProfile{
		Pantry: []grocerystore.PantryItem{{Name: "Eggs", Quantity: 1, AddedAt: 10}},
	}}
	built, err := NewWithLibrary(&shoppingToolModel{}, nil, nil, nil, repository)
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
	sawToolDelta := false
	for event, runErr := range run.Run(t.Context(), "user_1", "thread_1", genai.NewContentFromText("add two eggs", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
		if event == nil || event.Content == nil {
			continue
		}
		for _, part := range event.Content.Parts {
			if part != nil && part.FunctionResponse != nil && part.FunctionResponse.Name == "add_to_pantry" {
				_, hasProfile := event.Actions.StateDelta["shopping_profile"]
				_, hasPantry := event.Actions.StateDelta["pantry"]
				sawToolDelta = hasProfile && !hasPantry
			}
		}
	}
	if !sawToolDelta {
		t.Fatal("add_to_pantry tool response did not emit only the shopping_profile state delta")
	}
	stored, err := sessions.Get(t.Context(), &session.GetRequest{AppName: AppName, UserID: "user_1", SessionID: "thread_1"})
	if err != nil {
		t.Fatal(err)
	}
	state := readState(stored.Session.State())
	if len(state.ShoppingProfile.Pantry) != 1 || state.ShoppingProfile.Pantry[0].Quantity != 3 {
		t.Fatalf("persisted state = %#v", state)
	}
}

func TestShoppingProfileHydratesBeforeAgentAcrossSessions(t *testing.T) {
	expires := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC).Unix()
	repository := &fakeLibraryShoppingRepository{profile: grocerystore.ShoppingProfile{
		Pantry:    []grocerystore.PantryItem{{Name: "Eggs", Quantity: 2, AddedAt: 10, ExpiresAt: &expires}},
		Equipment: []grocerystore.EquipmentItem{{Name: "Oven", AddedAt: 11}},
	}}
	captured := &captureShoppingModel{}
	built, err := NewWithLibrary(captured, nil, nil, nil, repository)
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	for _, sessionID := range []string{"thread_1", "thread_2"} {
		if _, err := sessions.Create(t.Context(), &session.CreateRequest{
			AppName: AppName, UserID: "user_1", SessionID: sessionID, State: StateDefaults(),
		}); err != nil {
			t.Fatal(err)
		}
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: sessions})
	if err != nil {
		t.Fatal(err)
	}
	runTurn := func(sessionID string) GroceryState {
		t.Helper()
		for _, runErr := range run.Run(t.Context(), "user_1", sessionID, genai.NewContentFromText("show my pantry", genai.RoleUser), agent.RunConfig{}) {
			if runErr != nil {
				t.Fatal(runErr)
			}
		}
		stored, getErr := sessions.Get(t.Context(), &session.GetRequest{AppName: AppName, UserID: "user_1", SessionID: sessionID})
		if getErr != nil {
			t.Fatal(getErr)
		}
		return readState(stored.Session.State())
	}
	first := runTurn("thread_1")
	if len(first.ShoppingProfile.Pantry) != 1 || first.ShoppingProfile.Pantry[0].Quantity != 2 || first.ShoppingProfile.Pantry[0].ExpiresAt == nil || *first.ShoppingProfile.Pantry[0].ExpiresAt != expires || len(first.ShoppingProfile.Equipment) != 1 {
		t.Fatalf("initial hydrated state = %#v", first)
	}
	if instruction := shoppingInstructionText(captured.request); !strings.Contains(instruction, "Eggs") || strings.Contains(instruction, "{pantry}") {
		t.Fatalf("model instruction did not receive hydrated pantry: %q", instruction)
	}
	repository.profile.Pantry = []grocerystore.PantryItem{{Name: "Milk", Quantity: 1.5, AddedAt: 20}}
	repository.profile.Equipment = []grocerystore.EquipmentItem{{Name: "Blender", AddedAt: 21}}
	repository.pantry = nil
	updated := runTurn("thread_1")
	secondSession := runTurn("thread_2")
	for name, state := range map[string]GroceryState{"updated session": updated, "new session": secondSession} {
		if len(state.ShoppingProfile.Pantry) != 1 || state.ShoppingProfile.Pantry[0].Name != "Milk" || state.ShoppingProfile.Pantry[0].Quantity != 1.5 || len(state.ShoppingProfile.Equipment) != 1 || state.ShoppingProfile.Equipment[0].Name != "Blender" {
			t.Fatalf("%s did not converge: %#v", name, state)
		}
	}
}

type trackingShoppingState struct {
	mutableGroceryState
	writes []string
}

func (state *trackingShoppingState) Set(key string, value any) error {
	state.writes = append(state.writes, key)
	return state.mutableGroceryState.Set(key, value)
}

func (state *trackingShoppingState) wrote(key string) bool {
	return slices.Contains(state.writes, key)
}

// shoppingContext overrides identity and session state while StrictContextMock
// keeps these tests aligned with the rest of the installed ADK v2 Context
// interface as it evolves.
type shoppingContext struct {
	agent.StrictContextMock
	userID string
	state  session.State
}

func (c *shoppingContext) UserID() string { return c.userID }
func (c *shoppingContext) State() session.State {
	if c.state == nil {
		c.state = mutableGroceryState(StateDefaults())
	}
	return c.state
}
func (c *shoppingContext) ReadonlyState() session.ReadonlyState { return c.State() }

type fakeShoppingRepository struct {
	grocerystore.ShoppingRepository
	profile      grocerystore.ShoppingProfile
	pantry       []grocerystore.PantryItem
	added        []grocerystore.PantryItem
	userID       string
	addNow       time.Time
	profileCalls int
}

func (f *fakeShoppingRepository) AddPantryItems(_ context.Context, userID string, items []grocerystore.PantryItem, now time.Time) ([]grocerystore.PantryItem, error) {
	f.userID, f.addNow = userID, now
	f.added = append([]grocerystore.PantryItem(nil), items...)
	if f.pantry == nil {
		f.pantry = append([]grocerystore.PantryItem(nil), f.profile.Pantry...)
	}
	for _, added := range items {
		merged := false
		for index := range f.pantry {
			if strings.EqualFold(f.pantry[index].Name, added.Name) {
				f.pantry[index].Quantity += added.Quantity
				f.pantry[index].ExpiresAt = added.ExpiresAt
				merged = true
				break
			}
		}
		if !merged {
			added.AddedAt = now.Unix()
			f.pantry = append(f.pantry, added)
		}
	}
	f.profile.Pantry = append([]grocerystore.PantryItem(nil), f.pantry...)
	return f.pantry, nil
}

func (f *fakeShoppingRepository) RemovePantryItems(_ context.Context, userID string, names []string) ([]grocerystore.PantryItem, error) {
	f.userID = userID
	if f.pantry == nil {
		f.pantry = append([]grocerystore.PantryItem(nil), f.profile.Pantry...)
	}
	remaining := make([]grocerystore.PantryItem, 0, len(f.pantry))
	for _, item := range f.pantry {
		remove := false
		for _, name := range names {
			remove = remove || strings.EqualFold(item.Name, name)
		}
		if !remove {
			remaining = append(remaining, item)
		}
	}
	f.pantry = remaining
	f.profile.Pantry = append([]grocerystore.PantryItem(nil), remaining...)
	return append([]grocerystore.PantryItem(nil), remaining...), nil
}

func (f *fakeShoppingRepository) ClearPantry(_ context.Context, userID string) error {
	f.userID = userID
	f.pantry = []grocerystore.PantryItem{}
	f.profile.Pantry = []grocerystore.PantryItem{}
	return nil
}

func (f *fakeShoppingRepository) AddEquipment(_ context.Context, userID string, items []grocerystore.EquipmentItem, now time.Time) ([]grocerystore.EquipmentItem, error) {
	f.userID = userID
	for _, item := range items {
		item.AddedAt = now.Unix()
		f.profile.Equipment = append(f.profile.Equipment, item)
	}
	return append([]grocerystore.EquipmentItem(nil), f.profile.Equipment...), nil
}

func (f *fakeShoppingRepository) RemoveEquipment(_ context.Context, userID string, names []string) ([]grocerystore.EquipmentItem, error) {
	f.userID = userID
	remaining := make([]grocerystore.EquipmentItem, 0, len(f.profile.Equipment))
	for _, item := range f.profile.Equipment {
		remove := false
		for _, name := range names {
			remove = remove || strings.EqualFold(item.Name, name)
		}
		if !remove {
			remaining = append(remaining, item)
		}
	}
	f.profile.Equipment = remaining
	return append([]grocerystore.EquipmentItem(nil), remaining...), nil
}

func (f *fakeShoppingRepository) ClearEquipment(_ context.Context, userID string) error {
	f.userID = userID
	f.profile.Equipment = []grocerystore.EquipmentItem{}
	return nil
}

func (f *fakeShoppingRepository) RecentOrders(_ context.Context, userID string, limit int) ([]grocerystore.Order, error) {
	f.userID = userID
	if limit <= 0 {
		limit = 10
	}
	limit = min(limit, len(f.profile.RecentOrders))
	return append([]grocerystore.Order(nil), f.profile.RecentOrders[:limit]...), nil
}

func (f *fakeShoppingRepository) RecordOrder(_ context.Context, userID string, order grocerystore.Order, now time.Time) (grocerystore.Order, error) {
	f.userID = userID
	if order.ID == "" {
		order.ID = "order_recorded"
	}
	if order.PlacedAt == 0 {
		order.PlacedAt = now.Unix()
	}
	for _, item := range order.Items {
		order.TotalItems += item.Quantity
	}
	f.profile.RecentOrders = append([]grocerystore.Order{order}, f.profile.RecentOrders...)
	if len(order.Items) > 0 {
		f.profile.FrequentItems = []grocerystore.FrequentItem{{
			Name: order.Items[0].Name, UPC: order.Items[0].UPC, Orders: 1, TotalQuantity: order.Items[0].Quantity,
		}}
	}
	return order, nil
}

func (f *fakeShoppingRepository) PreferredStore(_ context.Context, userID string) (*grocerystore.PreferredStore, error) {
	f.userID = userID
	if f.profile.PreferredStore == nil {
		return nil, nil
	}
	store := *f.profile.PreferredStore
	return &store, nil
}

func (f *fakeShoppingRepository) SetPreferredStore(_ context.Context, userID string, store grocerystore.PreferredStore, _ time.Time) (grocerystore.PreferredStore, error) {
	f.userID = userID
	if f.profile.PreferredStore != nil && f.profile.PreferredStore.LocationID == store.LocationID &&
		f.profile.PreferredStore.Name == store.Name && f.profile.PreferredStore.Address == store.Address &&
		f.profile.PreferredStore.Chain == store.Chain {
		return *f.profile.PreferredStore, nil
	}
	f.profile.PreferredStore = &store
	return store, nil
}

func (f *fakeShoppingRepository) ShoppingProfile(_ context.Context, userID string) (grocerystore.ShoppingProfile, error) {
	f.userID = userID
	f.profileCalls++
	profile := f.profile
	if f.pantry != nil {
		profile.Pantry = append([]grocerystore.PantryItem(nil), f.pantry...)
	}
	if profile.Pantry == nil {
		profile.Pantry = []grocerystore.PantryItem{}
	}
	if profile.Equipment == nil {
		profile.Equipment = []grocerystore.EquipmentItem{}
	}
	if profile.RecentOrders == nil {
		profile.RecentOrders = []grocerystore.Order{}
	}
	if profile.FrequentItems == nil {
		profile.FrequentItems = []grocerystore.FrequentItem{}
	}
	return profile, nil
}

type fakeLibraryShoppingRepository struct {
	grocerystore.LibraryRepository
	fakeShoppingRepository
}

type fakeLibraryRepository struct {
	grocerystore.LibraryRepository
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

type shoppingToolModel struct {
	call int
}

func (*shoppingToolModel) Name() string { return "shopping-tool" }

func (m *shoppingToolModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	call := m.call
	m.call++
	return func(yield func(*model.LLMResponse, error) bool) {
		if call == 0 {
			yield(&model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{
				ID: "add-eggs", Name: "add_to_pantry", Args: map[string]any{"items": []any{map[string]any{"name": "Eggs", "quantity": 2.0}}},
			}}}}}, nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
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
	for _, runErr := range run.Run(scopedMCPContext(t), "user_1", "thread_1", genai.NewContentFromText("show my pantry", genai.RoleUser), agent.RunConfig{}) {
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
	for _, runErr := range run.Run(scopedMCPContext(t), "user_1", "thread_1", genai.NewContentFromText("show my pantry", genai.RoleUser), agent.RunConfig{}) {
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
