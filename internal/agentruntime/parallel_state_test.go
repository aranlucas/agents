package agentruntime

import (
	"context"
	"iter"
	"maps"
	"reflect"
	"testing"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

type parallelStateInput struct {
	Value string `json:"value"`
}

type parallelStateResult struct {
	OK bool `json:"ok"`
}

type parallelStateModel struct {
	calls []*genai.Part
}

func (*parallelStateModel) Name() string { return "parallel-state-model" }

func (m *parallelStateModel) GenerateContent(_ context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		for _, content := range request.Contents {
			for _, part := range content.Parts {
				if part.FunctionResponse != nil {
					yield(&model.LLMResponse{
						Content:      genai.NewContentFromText("done", genai.RoleModel),
						TurnComplete: true,
					}, nil)
					return
				}
			}
		}

		yield(&model.LLMResponse{
			Content:      &genai.Content{Role: genai.RoleModel, Parts: m.calls},
			TurnComplete: true,
		}, nil)
	}
}

func TestParallelToolStateWritesMergeIntoOneDeltaAndSession(t *testing.T) {
	writeDestinationTool, err := functiontool.New(functiontool.Config{
		Name:        "write_destination",
		Description: "Write a destination.",
	}, func(ctx agent.Context, input parallelStateInput) (parallelStateResult, error) {
		if err := ctx.State().Set("destination", input.Value); err != nil {
			return parallelStateResult{}, err
		}
		return parallelStateResult{OK: true}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	writeBudgetTool, err := functiontool.New(functiontool.Config{
		Name:        "write_budget",
		Description: "Write a budget.",
	}, func(ctx agent.Context, input parallelStateInput) (parallelStateResult, error) {
		if err := ctx.State().Set("budget", input.Value); err != nil {
			return parallelStateResult{}, err
		}
		return parallelStateResult{OK: true}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	model := &parallelStateModel{calls: []*genai.Part{
		{FunctionCall: &genai.FunctionCall{ID: "destination-call", Name: "write_destination", Args: map[string]any{"value": "Lisbon"}}},
		{FunctionCall: &genai.FunctionCall{ID: "budget-call", Name: "write_budget", Args: map[string]any{"value": "$2,000"}}},
	}}
	run, sessions := newParallelStateRunner(t, model, []tool.Tool{writeDestinationTool, writeBudgetTool})

	wantDelta := map[string]any{"destination": "Lisbon", "budget": "$2,000"}
	gotDelta := runParallelStateTurn(t, run)
	if !reflect.DeepEqual(gotDelta, wantDelta) {
		t.Fatalf("merged tool state delta = %#v, want %#v", gotDelta, wantDelta)
	}

	gotState := loadParallelState(t, sessions)
	for key, want := range wantDelta {
		if got := gotState[key]; got != want {
			t.Errorf("final session state[%q] = %#v, want %#v", key, got, want)
		}
	}
}

func TestParallelToolSameKeyUsesModelCallOrder(t *testing.T) {
	writeFirstTool, err := functiontool.New(functiontool.Config{
		Name:        "write_first",
		Description: "Write the first value.",
	}, func(ctx agent.Context, input parallelStateInput) (parallelStateResult, error) {
		if err := ctx.State().Set("shared", input.Value); err != nil {
			return parallelStateResult{}, err
		}
		return parallelStateResult{OK: true}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	writeLastTool, err := functiontool.New(functiontool.Config{
		Name:        "write_last",
		Description: "Write the last value.",
	}, func(ctx agent.Context, input parallelStateInput) (parallelStateResult, error) {
		if err := ctx.State().Set("shared", input.Value); err != nil {
			return parallelStateResult{}, err
		}
		return parallelStateResult{OK: true}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	model := &parallelStateModel{calls: []*genai.Part{
		{FunctionCall: &genai.FunctionCall{ID: "first-call", Name: "write_first", Args: map[string]any{"value": "first"}}},
		{FunctionCall: &genai.FunctionCall{ID: "last-call", Name: "write_last", Args: map[string]any{"value": "last"}}},
	}}
	run, sessions := newParallelStateRunner(t, model, []tool.Tool{writeFirstTool, writeLastTool})

	gotDelta := runParallelStateTurn(t, run)
	if got := gotDelta["shared"]; got != "last" {
		t.Fatalf("merged tool state delta shared = %#v, want model's last call value", got)
	}
	if got := loadParallelState(t, sessions)["shared"]; got != "last" {
		t.Fatalf("final session state shared = %#v, want model's last call value", got)
	}
}

func newParallelStateRunner(t *testing.T, model model.LLM, tools []tool.Tool) (*runner.Runner, session.Service) {
	t.Helper()

	built, err := llmagent.New(llmagent.Config{
		Name:        "parallel_state_agent",
		Instruction: "Run the requested state tools.",
		Model:       model,
		Tools:       tools,
	})
	if err != nil {
		t.Fatal(err)
	}

	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName:   "parallel_state_test",
		UserID:    "user",
		SessionID: "thread",
	}); err != nil {
		t.Fatal(err)
	}

	run, err := runner.New(runner.Config{
		AppName:        "parallel_state_test",
		Agent:          built,
		SessionService: sessions,
	})
	if err != nil {
		t.Fatal(err)
	}
	return run, sessions
}

func runParallelStateTurn(t *testing.T, run *runner.Runner) map[string]any {
	t.Helper()

	var mergedDelta map[string]any
	for event, err := range run.Run(
		t.Context(),
		"user",
		"thread",
		genai.NewContentFromText("write state", genai.RoleUser),
		agent.RunConfig{},
	) {
		if err != nil {
			t.Fatal(err)
		}
		if event == nil || event.Content == nil {
			continue
		}
		for _, part := range event.Content.Parts {
			if part.FunctionResponse != nil {
				mergedDelta = maps.Clone(event.Actions.StateDelta)
				break
			}
		}
	}
	if mergedDelta == nil {
		t.Fatal("runner emitted no merged function-response state delta")
	}
	return mergedDelta
}

func loadParallelState(t *testing.T, sessions session.Service) map[string]any {
	t.Helper()

	loaded, err := sessions.Get(t.Context(), &session.GetRequest{
		AppName:   "parallel_state_test",
		UserID:    "user",
		SessionID: "thread",
	})
	if err != nil {
		t.Fatal(err)
	}
	return maps.Collect(loaded.Session.State().All())
}
