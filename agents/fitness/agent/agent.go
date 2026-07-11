package fitness

import (
	"strings"
	"time"

	"agents/fitness/agent/tools"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	adktool "google.golang.org/adk/v2/tool"
)

type SearchArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}

type SearchResult struct {
	Results []common.SearchResult `json:"results"`
}

func New(m model.LLM, strava *Strava, search *common.BraveSearch, toolsets ...adktool.Toolset) (agent.Agent, error) {
	return newAgent(m, strava, search, llmagent.ModeChat, toolsets...)
}

func NewTask(m model.LLM, strava *Strava, search *common.BraveSearch, toolsets ...adktool.Toolset) (agent.Agent, error) {
	return newAgent(m, strava, search, llmagent.ModeTask, toolsets...)
}

func newAgent(m model.LLM, strava *Strava, search *common.BraveSearch, mode llmagent.Mode, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := staticTools(search)
	if err != nil {
		return nil, err
	}
	toolsets = append(toolsets, &stravaToolset{client: strava})
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Training plans and Strava-backed activity context.", Instruction: Instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets})
}

func staticTools(search *common.BraveSearch) ([]adktool.Tool, error) {
	getCurrentDateTool, err := tools.NewGetCurrentDate(GetCurrentDate)
	if err != nil {
		return nil, err
	}

	setObjectiveResearchTool, err := tools.NewSetObjectiveResearch(SetObjectiveResearch)
	if err != nil {
		return nil, err
	}

	setTrainingPlanTool, err := tools.NewSetTrainingPlan(SetTrainingPlan)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := tools.NewMarkPlanReady(MarkPlanReady)
	if err != nil {
		return nil, err
	}

	result := []adktool.Tool{
		getCurrentDateTool,
		setObjectiveResearchTool,
		setTrainingPlanTool,
		markReadyTool,
	}

	if search != nil {
		webSearchTool, err := tools.NewWebSearch(func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
			results, err := search.Search(ctx, input.Query, input.Count)
			return SearchResult{Results: results}, err
		})
		if err != nil {
			return nil, err
		}
		result = append(result, webSearchTool)
	}

	return result, nil
}

type stravaToolset struct{ client *Strava }

func (*stravaToolset) Name() string { return "strava" }
func (s *stravaToolset) Tools(ctx agent.ReadonlyContext) ([]adktool.Tool, error) {
	if s.client == nil || ctx == nil || ctx.ReadonlyState() == nil {
		return nil, nil
	}
	raw, err := ctx.ReadonlyState().Get(session.KeyPrefixTemp + "strava_token")
	token, ok := raw.(string)
	if err != nil || !ok || strings.TrimSpace(token) == "" {
		return nil, nil
	}
	fetch, err := tools.NewFetchActivities(func(ctx agent.Context, input FetchActivitiesArgs) (Result, error) {
		return FetchActivities(ctx, WithStravaToken(ctx, token), input, s.client, time.Now)
	})
	if err != nil {
		return nil, err
	}
	return []adktool.Tool{fetch}, nil
}
