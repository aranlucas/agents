package grocery

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

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
		state := groceryState{"temp:kroger_token": token}
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
	tools, err := NewKroger(http.DefaultClient, "https://example.com/mcp").Tools(groceryReadonlyContext{Context: t.Context(), state: groceryState{}})
	if err != nil || len(tools) != 0 {
		t.Fatalf("Tools() = %#v, %v", tools, err)
	}
}

type groceryReadonlyContext struct {
	context.Context
	state session.ReadonlyState
}

type groceryState map[string]any

func (s groceryState) Get(key string) (any, error) {
	value, ok := s[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (s groceryState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range s {
			if !yield(key, value) {
				return
			}
		}
	}
}

func (g groceryReadonlyContext) UserContent() *genai.Content          { return nil }
func (g groceryReadonlyContext) InvocationID() string                 { return "invocation" }
func (g groceryReadonlyContext) AgentName() string                    { return AppName }
func (g groceryReadonlyContext) ReadonlyState() session.ReadonlyState { return g.state }
func (g groceryReadonlyContext) UserID() string                       { return "user" }
func (g groceryReadonlyContext) AppName() string                      { return AppName }
func (g groceryReadonlyContext) SessionID() string                    { return "thread" }
func (g groceryReadonlyContext) Branch() string                       { return "" }
