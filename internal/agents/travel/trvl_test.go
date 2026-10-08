package travel

import (
	"context"
	"errors"
	"iter"
	"net/http"
	"net/http/httptest"
	"sync"
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
	t.Cleanup(func() {
		if err := toolset.Close(); err != nil {
			t.Error(err)
		}
	})
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

func TestTRVLDiscoveryWaitHonorsCancellationAndClose(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(started) })
		<-release
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	set := NewTRVL(server.URL, server.Client())
	defer func() { _ = set.Close() }()
	owner, cancelOwner := context.WithCancel(t.Context())
	defer cancelOwner()
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = set.Tools(testReadonlyContext{Context: owner})
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		close(release)
		t.Fatal("discovery did not start")
	}
	waiter, cancelWaiter := context.WithTimeout(t.Context(), 30*time.Millisecond)
	defer cancelWaiter()
	returned := make(chan error, 1)
	go func() { _, err := set.Tools(testReadonlyContext{Context: waiter}); returned <- err }()
	select {
	case err := <-returned:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("wait error = %v", err)
		}
	case <-time.After(time.Second):
		t.Error("waiter remained blocked behind another discovery")
	}
	cancelOwner()
	close(release)
	<-done
	if err := set.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := set.Tools(testReadonlyContext{Context: t.Context()}); !errors.Is(err, mcp.ErrConnectionClosed) {
		t.Fatalf("closed cache returned tools: %v", err)
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
