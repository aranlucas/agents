package grocery

import (
	"encoding/json"
	"errors"

	"agents/internal/bravesearch"
	"agents/internal/common"
	"agents/internal/groceries"
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
	Results []bravesearch.Result `json:"results"`
}
type LoadPageArgs struct {
	URL string `json:"url"`
}
type LoadPageResult struct {
	Page common.WebPage `json:"page"`
}

func New(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeChat, toolsets...)
}

func NewWithLibrary(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, repository groceries.LibraryRepository, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgentWithLibrary(m, kroger, search, loader, repository, llmagent.ModeChat, toolsets...)
}

func NewTask(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeTask, toolsets...)
}

func NewTaskWithLibrary(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, repository groceries.LibraryRepository, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgentWithLibrary(m, kroger, search, loader, repository, llmagent.ModeTask, toolsets...)
}

func newAgent(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, mode llmagent.Mode, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := groceryTools(search, loader)
	if err != nil {
		return nil, err
	}
	return buildAgent(m, kroger, tools, mode, toolsets...)
}

func newAgentWithLibrary(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, repository groceries.LibraryRepository, mode llmagent.Mode, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := groceryTools(search, loader)
	if err != nil {
		return nil, err
	}
	libraryTools, err := groceryLibraryTools(repository)
	if err != nil {
		return nil, err
	}
	return buildAgent(m, kroger, append(tools, libraryTools...), mode, toolsets...)
}

func buildAgent(m model.LLM, kroger *Kroger, tools []tool.Tool, mode llmagent.Mode, toolsets ...tool.Toolset) (agent.Agent, error) {
	if kroger != nil {
		toolsets = append(toolsets, kroger)
	}
	config := llmagent.Config{Name: AppName, Description: "Meal planning, pantry, shopping list, and cart support.", Instruction: Instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets, BeforeModelCallbacks: []llmagent.BeforeModelCallback{compactGroceryContext}}
	if mode == llmagent.ModeTask {
		config.DisallowTransferToParent = true
		config.DisallowTransferToPeers = true
	}
	return llmagent.New(config)
}

func groceryTools(search *bravesearch.Client, loader *common.WebLoader) ([]tool.Tool, error) {
	setShoppingListTool, err := functiontool.New(functiontool.Config{
		Name:        "set_shopping_list",
		Description: "Replace the unmaterialized shopping list.",
	}, SetShoppingList)
	if err != nil {
		return nil, err
	}

	setProductMatchesTool, err := functiontool.New(functiontool.Config{
		Name:        "set_product_matches",
		Description: "Replace live Kroger product previews using selected products from the latest search_products structured output.",
	}, SetProductMatches)
	if err != nil {
		return nil, err
	}

	updateCartTool, err := functiontool.New(functiontool.Config{
		Name:        "update_cart",
		Description: "Reflect only confirmed live Kroger cart contents in state.",
	}, UpdateCart)
	if err != nil {
		return nil, err
	}

	updatePantryTool, err := functiontool.New(functiontool.Config{
		Name:        "update_pantry",
		Description: "Replace validated pantry state.",
	}, UpdatePantry)
	if err != nil {
		return nil, err
	}

	setMealPlanTool, err := functiontool.New(functiontool.Config{
		Name:        "set_meal_plan",
		Description: "Write the meal plan to streamed state.",
	}, SetMealPlan)
	if err != nil {
		return nil, err
	}

	setRecipeTool, err := functiontool.New(functiontool.Config{
		Name:        "set_recipe",
		Description: "Write one complete structured recipe to streamed state so the user can review and choose whether to save it.",
	}, SetRecipe)
	if err != nil {
		return nil, err
	}

	setWeeklyDealsTool, err := functiontool.New(functiontool.Config{
		Name:        "set_weekly_deals",
		Description: "Write current weekly deals to state.",
	}, SetWeeklyDeals)
	if err != nil {
		return nil, err
	}

	markListReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_list_ready",
		Description: "Mark a complete shopping list ready.",
	}, MarkListReady)
	if err != nil {
		return nil, err
	}

	getCurrentDateTool, err := functiontool.New(functiontool.Config{
		Name:        "get_current_date",
		Description: "Return the current UTC date.",
	}, GetCurrentDate)
	if err != nil {
		return nil, err
	}

	result := []tool.Tool{
		setShoppingListTool,
		setProductMatchesTool,
		updateCartTool,
		updatePantryTool,
		setMealPlanTool,
		setRecipeTool,
		setWeeklyDealsTool,
		markListReadyTool,
		getCurrentDateTool,
	}

	if search != nil {
		webSearchTool, err := functiontool.New(functiontool.Config{
			Name:        "web_search",
			Description: "Search current public web results with the limited Brave budget.",
		}, func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
			results, err := search.Search(ctx, input.Query, input.Count)
			return SearchResult{Results: results}, err
		})
		if err != nil {
			return nil, err
		}
		result = append(result, webSearchTool)
	}

	if loader != nil {
		loadWebPageTool, err := functiontool.New(functiontool.Config{
			Name:        "load_web_page",
			Description: "Load bounded public HTTPS page text.",
		}, func(ctx agent.Context, input LoadPageArgs) (LoadPageResult, error) {
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

func groceryLibraryTools(repository groceries.LibraryRepository) ([]tool.Tool, error) {
	if repository == nil {
		return nil, errors.New("grocery library repository is required")
	}
	return savedResourceTools(repository)
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
