package grocery

import (
	json "encoding/json/v2"
	"errors"
	"strings"

	"github.com/aranlucas/agents/internal/bravesearch"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/grocerystore"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

type LoadPageArgs struct {
	URL string `json:"url"`
}
type LoadPageResult struct {
	Page common.WebPage `json:"page"`
}

func New(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeChat, nil, toolsets...)
}

func NewWithLibrary(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, repository grocerystore.LibraryRepository, toolsets ...tool.Toolset) (agent.Agent, error) {
	if repository == nil {
		return nil, errors.New("grocery library repository is required")
	}
	return newAgent(m, kroger, search, loader, llmagent.ModeChat, repository, toolsets...)
}

func NewTask(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	return newAgent(m, kroger, search, loader, llmagent.ModeTask, nil, toolsets...)
}

func NewTaskWithLibrary(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, repository grocerystore.LibraryRepository, toolsets ...tool.Toolset) (agent.Agent, error) {
	if repository == nil {
		return nil, errors.New("grocery library repository is required")
	}
	return newAgent(m, kroger, search, loader, llmagent.ModeTask, repository, toolsets...)
}

func newAgent(m model.LLM, kroger *Kroger, search *bravesearch.Client, loader *common.WebLoader, mode llmagent.Mode, repository grocerystore.LibraryRepository, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := groceryTools(search, loader)
	if err != nil {
		return nil, err
	}
	if repository != nil {
		libraryTools, err := groceryLibraryTools(repository)
		if err != nil {
			return nil, err
		}
		tools = append(tools, libraryTools...)
	}
	shoppingRepository, _ := nativeShoppingRepository(repository)
	nativeShopping := shoppingRepository != nil
	if kroger != nil {
		toolsets = append(toolsets, kroger.withNativeShopping(nativeShopping))
	}
	instruction := Instruction
	if nativeShopping {
		instruction = strings.TrimSpace(instruction) + "\n\n" + nativeShoppingInstruction
	}
	config := llmagent.Config{Name: AppName, Description: "Meal planning, pantry, shopping list, and cart support.", Instruction: instruction, Model: m, Mode: mode, Tools: tools, Toolsets: toolsets, BeforeModelCallbacks: []llmagent.BeforeModelCallback{compactGroceryContext}}
	if nativeShopping {
		config.BeforeAgentCallbacks = []agent.BeforeAgentCallback{hydrateShoppingProfileState(shoppingRepository)}
	}
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

	getCurrentDateTool, err := common.CurrentDateTool()
	if err != nil {
		return nil, err
	}

	result := []tool.Tool{
		setShoppingListTool,
		setProductMatchesTool,
		updateCartTool,
		setMealPlanTool,
		setRecipeTool,
		setWeeklyDealsTool,
		markListReadyTool,
		getCurrentDateTool,
	}

	if search != nil {
		webSearchTool, err := search.SearchTool("Search current public web results with the limited Brave budget.")
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

func groceryLibraryTools(repository grocerystore.LibraryRepository) ([]tool.Tool, error) {
	if repository == nil {
		return nil, errors.New("grocery library repository is required")
	}
	tools, err := savedResourceTools(repository)
	if err != nil {
		return nil, err
	}
	if shoppingRepository, ok := nativeShoppingRepository(repository); ok {
		shoppingTools, err := shoppingResourceTools(shoppingRepository)
		if err != nil {
			return nil, err
		}
		tools = append(tools, shoppingTools...)
	}
	return tools, nil
}

func nativeShoppingRepository(repository grocerystore.LibraryRepository) (grocerystore.ShoppingRepository, bool) {
	shoppingRepository, ok := repository.(grocerystore.ShoppingRepository)
	return shoppingRepository, ok && shoppingRepository != nil
}

const nativeShoppingInstruction = "" +
	"Pantry, kitchen equipment, saved orders, shopping profile, and preferred-store " +
	"profile data are shared gateway-backed data. Use the native " +
	"`get_shopping_profile`, `add_to_pantry`, `remove_from_pantry`, `add_equipment`, " +
	"`remove_equipment`, `get_recent_orders`, `record_order`, `get_preferred_store`, " +
	"and `set_preferred_store` tools for those domains. The Kroger MCP connection is " +
	"limited to live product, store, cart, and weekly-deal operations; do not use a " +
	"Kroger inventory, profile, meal-planning, or order-history tool."

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
