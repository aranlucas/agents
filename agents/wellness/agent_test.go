package wellness

import (
	"context"
	"iter"
	"maps"
	"strings"
	"sync"
	"testing"

	"agents/fitness"
	"agents/grocery"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestWellnessAgentUsesFitnessThenGroceryTaskChildren(t *testing.T) {
	fitnessAgent, err := fitness.NewTask(fakeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.NewTask(fakeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	built, err := New(ModelSet{Coordinator: fakeModel{}}, fitnessAgent, groceryAgent)
	if err != nil {
		t.Fatal(err)
	}
	children := built.SubAgents()
	if len(children) != 2 || children[0].Name() != fitness.AppName || children[1].Name() != grocery.AppName {
		t.Fatalf("children = %#v", children)
	}
	fitnessIndex, groceryIndex := strings.Index(Instruction, "Call `fitness_agent` first"), strings.Index(Instruction, "call `grocery_agent`")
	if fitnessIndex < 0 || groceryIndex <= fitnessIndex {
		t.Fatal("instruction does not enforce specialist ordering")
	}
}

func TestWellnessTaskAgentsShareStateInRequiredOrder(t *testing.T) {
	fitnessModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("fitness-plan", "set_training_plan", map[string]any{"plan": "Monday: easy run"}),
		functionCall("fitness-done", "finish_task", map[string]any{"result": "training plan ready"}),
	}}
	groceryModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("grocery-plan", "set_meal_plan", map[string]any{"plan": "Monday: salmon bowl"}),
		functionCall("grocery-done", "finish_task", map[string]any{"result": "meal plan ready"}),
	}}
	coordinatorModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("delegate-fitness", fitness.AppName, map[string]any{"request": "build this week's training plan"}),
		functionCall("delegate-grocery", grocery.AppName, map[string]any{"request": "read shared training_plan and build meals"}),
		functionCall("combine", "set_weekly_wellness_plan", map[string]any{"plan": validWeeklyPlan()}),
		functionCall("ready", "mark_plan_ready", map[string]any{"summary": "Balanced week"}),
		{Content: genai.NewContentFromText("Plan ready.", genai.RoleModel), TurnComplete: true},
	}}
	fitnessAgent, err := fitness.NewTask(fitnessModel, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.NewTask(groceryModel, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	built, err := New(ModelSet{Coordinator: coordinatorModel}, fitnessAgent, groceryAgent)
	if err != nil {
		t.Fatal(err)
	}
	service := session.InMemoryService()
	if _, err := service.Create(t.Context(), &session.CreateRequest{AppName: AppName, UserID: "user", SessionID: "thread", State: connectedWellnessState()}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: service})
	if err != nil {
		t.Fatal(err)
	}
	for _, runErr := range run.Run(t.Context(), "user", "thread", genai.NewContentFromText("Plan my week", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
	}
	loaded, err := service.Get(t.Context(), &session.GetRequest{AppName: AppName, UserID: "user", SessionID: "thread"})
	if err != nil {
		t.Fatal(err)
	}
	state := agentStateMap(loaded.Session.State())
	if state["training_plan"] != "Monday: easy run" || state["meal_plan"] != "Monday: salmon bowl" || state["weekly_plan"] != validWeeklyPlan() || state["status"] != StatusReady {
		t.Fatalf("state = %#v", state)
	}
	if fitnessModel.sawTransferTool || groceryModel.sawTransferTool {
		t.Fatalf("task child advertised transfer_to_agent: fitness=%t grocery=%t", fitnessModel.sawTransferTool, groceryModel.sawTransferTool)
	}
}

type scriptedModel struct {
	mu              sync.Mutex
	responses       []*model.LLMResponse
	index           int
	sawTransferTool bool
}

func (*scriptedModel) Name() string { return "scripted" }
func (m *scriptedModel) GenerateContent(_ context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.mu.Lock()
	index := m.index
	m.index++
	if request != nil && request.Config != nil {
		for _, tools := range request.Config.Tools {
			if tools == nil {
				continue
			}
			for _, declaration := range tools.FunctionDeclarations {
				if declaration != nil && declaration.Name == "transfer_to_agent" {
					m.sawTransferTool = true
				}
			}
		}
	}
	m.mu.Unlock()
	return func(yield func(*model.LLMResponse, error) bool) {
		if index < len(m.responses) {
			yield(m.responses[index], nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func functionCall(id, name string, args map[string]any) *model.LLMResponse {
	return &model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: id, Name: name, Args: args}}}}}
}

func connectedWellnessState() map[string]any {
	state := StateDefaults()
	state["fitness_data_connected"], state["kroger_connected"] = true, true
	return state
}

func agentStateMap(state session.ReadonlyState) map[string]any {
	result := maps.Collect(state.All())
	return result
}
