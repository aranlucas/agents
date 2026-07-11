package grocery

import (
	"encoding/json"
	"errors"

	"agents/grocery/agent/tools"
	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
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

func New(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, toolsets ...adktool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeChat, toolsets...)
}

func NewTask(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, toolsets ...adktool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeTask, toolsets...)
}

func newAgent(m model.LLM, kroger *Kroger, search *common.BraveSearch, loader *common.WebLoader, mode llmagent.Mode, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := groceryTools(search, loader)
	if err != nil {
		return nil, err
	}
	if kroger != nil {
		toolsets = append(toolsets, kroger)
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Meal planning, pantry, shopping list, and cart support.", Instruction: Instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets, BeforeModelCallbacks: []llmagent.BeforeModelCallback{compactGroceryContext}})
}

func groceryTools(search *common.BraveSearch, loader *common.WebLoader) ([]adktool.Tool, error) {
	setShoppingListTool, err := tools.NewSetShoppingList(SetShoppingList)
	if err != nil {
		return nil, err
	}

	updateCartTool, err := tools.NewUpdateCart(UpdateCart)
	if err != nil {
		return nil, err
	}

	updatePantryTool, err := tools.NewUpdatePantry(UpdatePantry)
	if err != nil {
		return nil, err
	}

	setMealPlanTool, err := tools.NewSetMealPlan(SetMealPlan)
	if err != nil {
		return nil, err
	}

	setWeeklyDealsTool, err := tools.NewSetWeeklyDeals(SetWeeklyDeals)
	if err != nil {
		return nil, err
	}

	markListReadyTool, err := tools.NewMarkListReady(MarkListReady)
	if err != nil {
		return nil, err
	}

	getCurrentDateTool, err := tools.NewGetCurrentDate(GetCurrentDate)
	if err != nil {
		return nil, err
	}

	result := []adktool.Tool{
		setShoppingListTool,
		updateCartTool,
		updatePantryTool,
		setMealPlanTool,
		setWeeklyDealsTool,
		markListReadyTool,
		getCurrentDateTool,
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

	if loader != nil {
		loadWebPageTool, err := tools.NewLoadWebPage(func(ctx agent.Context, input LoadPageArgs) (LoadPageResult, error) {
			page, err := loader.Load(ctx, input.URL)
			return LoadPageResult{Page: page}, err
		})
		if err != nil {
			return nil, err
		}
		result = append(result, loadWebPageTool)
	}

	return result, nil
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
