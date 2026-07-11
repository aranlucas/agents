package wellness

import (
	"errors"

	"agents/fitness/agent"
	"agents/grocery/agent"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type ModelSet struct{ Coordinator model.LLM }

func New(models ModelSet, fitnessAgent, groceryAgent agent.Agent, toolsets ...adktool.Toolset) (agent.Agent, error) {
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

func wellnessTools() ([]adktool.Tool, error) {
	getCurrentDateTool, err := functiontool.New(functiontool.Config{
		Name:        "get_current_date",
		Description: "Return the current UTC date.",
	}, GetCurrentDate)
	if err != nil {
		return nil, err
	}

	setWeeklyWellnessPlanTool, err := functiontool.New(functiontool.Config{
		Name:        "set_weekly_wellness_plan",
		Description: "Write the combined weekly plan to streamed state.",
	}, SetWeeklyWellnessPlan)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_plan_ready",
		Description: "Mark a complete combined wellness plan ready.",
	}, MarkPlanReady)
	if err != nil {
		return nil, err
	}

	return []adktool.Tool{
		getCurrentDateTool,
		setWeeklyWellnessPlanTool,
		markReadyTool,
	}, nil
}

func enforceSpecialistOrder(ctx agent.Context, called adktool.Tool, _ map[string]any) (map[string]any, error) {
	state := readState(ctx.State())
	if policyError := specialistPolicy(state, called.Name()); policyError != nil {
		return map[string]any{"ok": false, "error": policyError}, nil
	}
	return nil, nil
}
