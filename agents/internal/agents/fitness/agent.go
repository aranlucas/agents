package fitness

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type SearchArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}

type SearchResult struct {
	Results []common.SearchResult `json:"results"`
}

func New(m model.LLM, strava *Strava, search *common.BraveSearch, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := staticTools(search)
	if err != nil {
		return nil, err
	}
	toolsets = append(toolsets, &stravaToolset{client: strava})
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Training plans and Strava-backed activity context.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func staticTools(search *common.BraveSearch) ([]tool.Tool, error) {
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
	if err := add(functiontool.New(functiontool.Config{Name: "set_objective_research", Description: "Write concise sourced objective research to state."}, wrap(SetObjectiveResearch))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_training_plan", Description: "Write the complete weekly training plan to state."}, wrap(SetTrainingPlan))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_plan_ready", Description: "Mark a complete training plan ready."}, wrap(MarkPlanReady))); err != nil {
		return nil, err
	}
	if search != nil {
		if err := add(functiontool.New(functiontool.Config{Name: "web_search", Description: "Search current public web results with the limited Brave budget."}, func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
			results, err := search.Search(ctx, input.Query, input.Count)
			return SearchResult{Results: results}, err
		})); err != nil {
			return nil, err
		}
	}
	return tools, nil
}

type stravaToolset struct{ client *Strava }

func (*stravaToolset) Name() string { return "strava" }
func (s *stravaToolset) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	if s.client == nil || ctx == nil || ctx.ReadonlyState() == nil {
		return nil, nil
	}
	raw, err := ctx.ReadonlyState().Get(session.KeyPrefixTemp + "strava_token")
	token, ok := raw.(string)
	if err != nil || !ok || strings.TrimSpace(token) == "" {
		return nil, nil
	}
	fetch, err := functiontool.New(functiontool.Config{Name: "fetch_activities", Description: "Fetch and merge one bounded page of Strava activities."}, func(ctx agent.Context, input FetchActivitiesArgs) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		result, err := FetchActivities(WithStravaToken(ctx, token), tx, input, s.client, time.Now)
		if err != nil {
			return Result{}, err
		}
		if err := agentruntime.Commit(ctx, tx); err != nil {
			return Result{}, fmt.Errorf("commit fitness state: %w", err)
		}
		return result, nil
	})
	if err != nil {
		return nil, err
	}
	return []tool.Tool{fetch}, nil
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
				return Result{}, fmt.Errorf("commit fitness state: %w", err)
			}
		}
		return result, nil
	}
}
