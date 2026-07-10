package grocery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

type SearchArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}
type SearchResult struct {
	Results []common.SearchResult `json:"results"`
}
type LoadPageArgs struct {
	URL string `json:"url"`
}
type LoadPageResult struct {
	Page common.WebPage `json:"page"`
}

func New(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeChat, toolsets...)
}

func NewTask(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeTask, toolsets...)
}

func newAgent(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, mode llmagent.Mode, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := groceryTools(search, loader)
	if err != nil {
		return nil, err
	}
	if kroger != nil {
		toolsets = append(toolsets, kroger)
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Meal planning, pantry, shopping list, and cart support.", Instruction: Instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets, BeforeModelCallbacks: []llmagent.BeforeModelCallback{compactGroceryContext}})
}

func groceryTools(search *common.BraveSearch, loader *common.WebLoader) ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_shopping_list", Description: "Replace the unmaterialized shopping list."}, wrap(SetShoppingList))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_cart", Description: "Reflect only confirmed live Kroger cart contents in state."}, wrap(UpdateCart))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_pantry", Description: "Replace validated pantry state."}, wrap(UpdatePantry))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_meal_plan", Description: "Write the meal plan to streamed state."}, wrap(SetMealPlan))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_weekly_deals", Description: "Write current weekly deals to state."}, wrap(SetWeeklyDeals))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_list_ready", Description: "Mark a complete shopping list ready."}, wrap(MarkListReady))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "get_current_date", Description: "Return the current UTC date."}, wrap(GetCurrentDate))); err != nil {
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
	if loader != nil {
		if err := add(functiontool.New(functiontool.Config{Name: "load_web_page", Description: "Load bounded public HTTPS page text."}, func(ctx agent.Context, input LoadPageArgs) (LoadPageResult, error) {
			page, err := loader.Load(ctx, input.URL)
			return LoadPageResult{Page: page}, err
		})); err != nil {
			return nil, err
		}
	}
	return tools, nil
}

func compactGroceryContext(_ agent.Context, request *model.LLMRequest) (*model.LLMResponse, error) {
	const maxContents, maxBytes = 40, 512 << 10
	start := max(0, len(request.Contents)-maxContents)
	for start < len(request.Contents)-1 && !safeContextBoundary(request.Contents[start]) {
		start++
	}
	request.Contents = request.Contents[start:]
	for len(request.Contents) > 1 {
		encoded, _ := json.Marshal(request.Contents)
		if len(encoded) <= maxBytes {
			break
		}
		request.Contents = request.Contents[1:]
		for len(request.Contents) > 1 && !safeContextBoundary(request.Contents[0]) {
			request.Contents = request.Contents[1:]
		}
	}
	encoded, _ := json.Marshal(request.Contents)
	if len(encoded) > maxBytes {
		return nil, errors.New("grocery model context exceeds the allowed size")
	}
	return nil, nil
}

func safeContextBoundary(content *genai.Content) bool {
	if content == nil || content.Role != genai.RoleUser {
		return false
	}
	for _, part := range content.Parts {
		if part.FunctionResponse != nil {
			return false
		}
	}
	return true
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
				return Result{}, fmt.Errorf("commit grocery state: %w", err)
			}
		}
		return result, nil
	}
}
