package grocery

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"

	"github.com/aranlucas/agents/internal/mcpruntime"
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
	ctx, closeMCP := mcpruntime.WithScope(t.Context())
	t.Cleanup(func() {
		if err := closeMCP(); err != nil {
			t.Error(err)
		}
	})
	for _, token := range []string{"token-a", "token-b"} {
		state := groceryState{"temp:kroger_token": token}
		tools, err := kroger.Tools(groceryReadonlyContext{Context: ctx, state: state})
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

func TestKrogerBearerTransportStripsTokenFromCrossOriginRedirect(t *testing.T) {
	var receivedAuthorization string
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		receivedAuthorization = request.Header.Get("Authorization")
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(destination.Close)

	source := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		http.Redirect(w, request, destination.URL+"/redirected", http.StatusTemporaryRedirect)
	}))
	t.Cleanup(source.Close)
	origin, err := url.Parse(source.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := source.Client()
	client.Transport = &bearerTransport{base: client.Transport, token: "kroger-secret", origin: origin}
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, source.URL+"/start", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if receivedAuthorization != "" {
		t.Fatalf("cross-origin Authorization = %q", receivedAuthorization)
	}
}

func TestKrogerBearerTransportKeepsTokenOnSameOriginRedirect(t *testing.T) {
	var receivedAuthorization string
	mux := http.NewServeMux()
	mux.HandleFunc("/start", func(w http.ResponseWriter, request *http.Request) {
		http.Redirect(w, request, "/redirected", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("/redirected", func(w http.ResponseWriter, request *http.Request) {
		receivedAuthorization = request.Header.Get("Authorization")
		w.WriteHeader(http.StatusNoContent)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	origin, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := server.Client()
	client.Transport = &bearerTransport{base: client.Transport, token: "kroger-secret", origin: origin}
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, server.URL+"/start", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if receivedAuthorization != "Bearer kroger-secret" {
		t.Fatalf("same-origin Authorization = %q", receivedAuthorization)
	}
}

func TestKrogerToolsetHidesToolsWithoutToken(t *testing.T) {
	tools, err := NewKroger(http.DefaultClient, "https://example.com/mcp").Tools(groceryReadonlyContext{Context: t.Context(), state: groceryState{}})
	if err != nil || len(tools) != 0 {
		t.Fatalf("Tools() = %#v, %v", tools, err)
	}
}

func TestKrogerMCPFiltersSupersededInventoryAndProfileTools(t *testing.T) {
	server := mcp.NewServer(&mcp.Implementation{Name: "kroger-filter-fixture", Version: "1"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "add_to_inventory", Description: "superseded inventory"}, weeklyDeals)
	mcp.AddTool(server, &mcp.Tool{Name: "get_shopping_profile", Description: "superseded profile"}, weeklyDeals)
	mcp.AddTool(server, &mcp.Tool{Name: "set_preferred_store", Description: "native duplicate"}, weeklyDeals)
	mcp.AddTool(server, &mcp.Tool{Name: "get_weekly_deals", Description: "live Kroger deals"}, weeklyDeals)
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true})
	httpServer := httptest.NewServer(handler)
	t.Cleanup(httpServer.Close)
	ctx := scopedMCPContext(t)

	tools, err := NewKroger(httpServer.Client(), httpServer.URL).withNativeShopping(true).Tools(groceryReadonlyContext{
		Context: ctx, state: groceryState{"temp:kroger_token": "token"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 1 || tools[0].Name() != "get_weekly_deals" {
		t.Fatalf("filtered tools = %#v", tools)
	}
}

type groceryReadonlyContext struct {
	context.Context
	state session.ReadonlyState
}

func scopedMCPContext(t *testing.T) context.Context {
	t.Helper()
	ctx, closeRun := mcpruntime.WithScope(t.Context())
	t.Cleanup(func() {
		if err := closeRun(); err != nil {
			t.Error(err)
		}
	})
	return ctx
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
