package grocery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"agents/internal/agentruntime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type (
	dealsInput  struct{}
	dealsOutput struct {
		Deals []string `json:"deals"`
	}
)

func weeklyDeals(context.Context, *mcp.CallToolRequest, dealsInput) (*mcp.CallToolResult, dealsOutput, error) {
	return nil, dealsOutput{Deals: []string{"milk"}}, nil
}

func TestKrogerMCPUsesOnlyRequestScopedToken(t *testing.T) {
	server := mcp.NewServer(&mcp.Implementation{Name: "kroger-fixture", Version: "1"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "get_weekly_deals", Description: "Current deals"}, weeklyDeals)
	var mu sync.Mutex
	counts := map[string]int{}
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true})
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		mu.Lock()
		counts[request.Header.Get("Authorization")]++
		mu.Unlock()
		handler.ServeHTTP(w, request)
	}))
	t.Cleanup(httpServer.Close)
	kroger := NewKroger(httpServer.Client(), httpServer.URL)
	for _, token := range []string{"token-a", "token-b"} {
		state := agentruntime.StateMap{"temp:kroger_token": token}
		tools, err := kroger.Tools(groceryReadonlyContext{Context: t.Context(), state: state})
		if err != nil || len(tools) != 1 || tools[0].Name() != "get_weekly_deals" {
			t.Fatalf("Tools(%s) = %#v, %v", token, tools, err)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if counts["Bearer token-a"] == 0 || counts["Bearer token-b"] == 0 || counts[""] != 0 {
		t.Fatalf("authorization counts = %#v", counts)
	}
}

func TestKrogerToolsetHidesToolsWithoutToken(t *testing.T) {
	tools, err := NewKroger(http.DefaultClient, "https://example.com/mcp").Tools(groceryReadonlyContext{Context: t.Context(), state: agentruntime.StateMap{}})
	if err != nil || len(tools) != 0 {
		t.Fatalf("Tools() = %#v, %v", tools, err)
	}
}

func TestGroceryApprovalAndDirectCartIntentAreNarrow(t *testing.T) {
	direct := &genai.Content{Parts: []*genai.Part{{Text: "Please add milk to my cart"}}}
	if !directCartRequest(direct) || directCartRequest(&genai.Content{Parts: []*genai.Part{{Text: "Show me milk"}}}) || directCartRequest(&genai.Content{Parts: []*genai.Part{{Text: "Should I add milk to my cart?"}}}) || directCartRequest(&genai.Content{Parts: []*genai.Part{{Text: "Do not add milk to my cart"}}}) {
		t.Fatal("direct cart intent classification is too broad or too narrow")
	}
	approved := &genai.Content{Parts: []*genai.Part{{FunctionResponse: &genai.FunctionResponse{Name: "request_user_approval", Response: map[string]any{"approved": true, "_agui_request": map[string]any{"action": "checkout_shopping_list"}}}}}}
	if !approvedForGroceryTool(approved, "checkout_shopping_list") || approvedForGroceryTool(approved, "add_to_cart") {
		t.Fatal("approval was not bound to the exact action")
	}
}

type groceryReadonlyContext struct {
	context.Context
	state session.ReadonlyState
}

func (g groceryReadonlyContext) UserContent() *genai.Content          { return nil }
func (g groceryReadonlyContext) InvocationID() string                 { return "invocation" }
func (g groceryReadonlyContext) AgentName() string                    { return AppName }
func (g groceryReadonlyContext) ReadonlyState() session.ReadonlyState { return g.state }
func (g groceryReadonlyContext) UserID() string                       { return "user" }
func (g groceryReadonlyContext) AppName() string                      { return AppName }
func (g groceryReadonlyContext) SessionID() string                    { return "thread" }
func (g groceryReadonlyContext) Branch() string                       { return "" }
