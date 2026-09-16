package fitness

import (
	"agents/internal/bravesearch"
	"agents/internal/common"
	"agents/internal/fitnessdata"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, activities fitnessdata.Repository, search *bravesearch.Client, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, activities, search, llmagent.ModeChat, toolsets...)
}

func NewTask(m model.LLM, activities fitnessdata.Repository, search *bravesearch.Client, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, activities, search, llmagent.ModeTask, toolsets...)
}

func newAgent(m model.LLM, activities fitnessdata.Repository, search *bravesearch.Client, mode llmagent.Mode, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := staticTools(search)
	if err != nil {
		return nil, err
	}
	toolsets = append(toolsets, &activityToolset{repository: activities})
	config := llmagent.Config{Name: AppName, Description: "Training plans with synced health activity context.", Instruction: Instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets}
	if mode == llmagent.ModeTask {
		// Delegated task children return through finish_task. Advertising
		// transfer_to_agent inside a dynamic task can make ADK attempt a nested
		// workflow outside the task node.
		config.DisallowTransferToParent = true
		config.DisallowTransferToPeers = true
	}
	return llmagent.New(config)
}

func staticTools(search *bravesearch.Client) ([]tool.Tool, error) {
	getCurrentDateTool, err := common.CurrentDateTool()
	if err != nil {
		return nil, err
	}

	setObjectiveResearchTool, err := functiontool.New(functiontool.Config{
		Name:        "set_objective_research",
		Description: "Write concise sourced objective research to state.",
	}, SetObjectiveResearch)
	if err != nil {
		return nil, err
	}

	setTrainingPlanTool, err := functiontool.New(functiontool.Config{
		Name:        "set_training_plan",
		Description: "Write the complete weekly training plan to state.",
	}, SetTrainingPlan)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_plan_ready",
		Description: "Mark a complete training plan ready.",
	}, MarkPlanReady)
	if err != nil {
		return nil, err
	}

	result := []tool.Tool{
		getCurrentDateTool,
		setObjectiveResearchTool,
		setTrainingPlanTool,
		markReadyTool,
	}

	if search != nil {
		webSearchTool, err := search.SearchTool("Search current public web results with the limited Brave budget.")
		if err != nil {
			return nil, err
		}
		result = append(result, webSearchTool)
	}

	return result, nil
}

type activityToolset struct{ repository fitnessdata.Repository }

func (*activityToolset) Name() string { return "fitness_activities" }
func (s *activityToolset) Tools(agent.ReadonlyContext) ([]tool.Tool, error) {
	if s.repository == nil {
		return nil, nil
	}
	fetch, err := functiontool.New(functiontool.Config{
		Name:        "fetch_activities",
		Description: "Load the authenticated user's recent synced fitness activities.",
	}, func(ctx agent.Context, input FetchActivitiesArgs) (Result, error) {
		return FetchActivities(ctx, input, s.repository)
	})
	if err != nil {
		return nil, err
	}
	return []tool.Tool{fetch}, nil
}
