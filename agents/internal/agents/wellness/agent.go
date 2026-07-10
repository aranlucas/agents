package wellness

import (
	"context"
	"errors"
	"fmt"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/fitness"
	"github.com/aranlucas/agents/agents/internal/agents/grocery"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type ModelSet struct{ Coordinator model.LLM }

func New(models ModelSet, fitnessAgent, groceryAgent agent.Agent, toolsets ...tool.Toolset) (agent.Agent, error) {
	if models.Coordinator == nil {
		return nil, errors.New("wellness coordinator model is required")
	}
	if fitnessAgent == nil || fitnessAgent.Name() != fitness.AppName || groceryAgent == nil || groceryAgent.Name() != grocery.AppName {
		return nil, errors.New("wellness requires fitness_agent and grocery_agent children")
	}
	tools, err := wellnessTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name: AppName, Description: "In-process grocery and fitness orchestration.", Instruction: Instruction,
		Model: models.Coordinator, Mode: llmagent.ModeChat, Tools: tools, Toolsets: toolsets,
		SubAgents: []agent.Agent{fitnessAgent, groceryAgent}, BeforeToolCallbacks: []llmagent.BeforeToolCallback{enforceSpecialistOrder},
	})
}

func wellnessTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "get_current_date", Description: "Return the current UTC date."}, wrap(GetCurrentDate))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_weekly_wellness_plan", Description: "Write the combined weekly plan to streamed state."}, wrap(SetWeeklyWellnessPlan))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_plan_ready", Description: "Mark a complete combined wellness plan ready."}, wrap(MarkPlanReady))); err != nil {
		return nil, err
	}
	return tools, nil
}

func enforceSpecialistOrder(ctx agent.Context, called tool.Tool, _ map[string]any) (map[string]any, error) {
	state := decodeState(agentruntime.NewTransactionFromState(ctx.State()))
	if policyError := specialistPolicy(state, called.Name()); policyError != nil {
		return map[string]any{"ok": false, "error": policyError}, nil
	}
	return nil, nil
}

type handler[A any] func(context.Context, *agentruntime.Transaction, A) (Result, error)

func wrap[A any](handler handler[A]) functiontool.Func[A, Result] {
	return func(ctx agent.Context, input A) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		result, err := handler(ctx, tx, input)
		if err != nil {
			return Result{}, err
		}
		if result.OK {
			if err := agentruntime.Commit(ctx, tx); err != nil {
				return Result{}, fmt.Errorf("commit wellness state: %w", err)
			}
		}
		return result, nil
	}
}
