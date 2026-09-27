package travel

import (
	"context"
	"iter"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type destinationInput struct {
	Destination string `json:"destination"`
}

type destinationOutput struct {
	Country string `json:"country"`
}

func destinationInfo(context.Context, *mcp.CallToolRequest, destinationInput) (*mcp.CallToolResult, destinationOutput, error) {
	return nil, destinationOutput{Country: "Portugal"}, nil
}

func TestTRVLDiscoversToolsThroughBoundedStreamableHTTP(t *testing.T) {
	server := mcp.NewServer(&mcp.Implementation{Name: "trvl-fixture", Version: "1"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "destination_info", Description: "Look up a destination"}, destinationInfo)
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true}))
	t.Cleanup(httpServer.Close)
	client := httpServer.Client()
	client.Timeout = 2 * time.Second
	toolset := NewTRVL(httpServer.URL, client)
	tools, err := toolset.Tools(testReadonlyContext{Context: t.Context()})
	if err != nil || len(tools) != 1 || tools[0].Name() != "destination_info" {
		t.Fatalf("Tools() = %#v, %v", tools, err)
	}
	// The second read comes from the discovery cache and must remain stable.
	second, err := toolset.Tools(testReadonlyContext{Context: t.Context()})
	if err != nil || len(second) != 1 || second[0].Name() != "destination_info" {
		t.Fatalf("cached Tools() = %#v, %v", second, err)
	}
}

func TestTRVLRejectsNonTLSRemoteEndpoint(t *testing.T) {
	_, err := NewTRVL("http://example.com/mcp", nil).Tools(testReadonlyContext{Context: t.Context()})
	if err == nil {
		t.Fatal("non-TLS remote endpoint accepted")
	}
}

type testReadonlyContext struct{ context.Context }

func (testReadonlyContext) UserContent() *genai.Content          { return nil }
func (testReadonlyContext) InvocationID() string                 { return "invocation" }
func (testReadonlyContext) AgentName() string                    { return AppName }
func (testReadonlyContext) ReadonlyState() session.ReadonlyState { return agentState{} }
func (testReadonlyContext) UserID() string                       { return "user" }
func (testReadonlyContext) AppName() string                      { return AppName }
func (testReadonlyContext) SessionID() string                    { return "thread" }
func (testReadonlyContext) Branch() string                       { return "" }

type agentState struct{}

func (agentState) Get(string) (any, error) { return nil, session.ErrStateKeyNotExist }
func (agentState) All() iter.Seq2[string, any] {
	return func(func(string, any) bool) {}
}
