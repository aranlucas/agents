package mcpruntime_test

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"io"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/aranlucas/agents/internal/agents/grocery"
	"github.com/aranlucas/agents/internal/agents/travel"
	"github.com/aranlucas/agents/internal/mcpruntime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

type callModel struct{ toolName string }

func (callModel) Name() string { return "mcp-fixture" }
func (m callModel) GenerateContent(_ context.Context, req *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		for _, content := range req.Contents {
			for _, part := range content.Parts {
				if part.FunctionResponse != nil {
					yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
					return
				}
			}
		}
		yield(&model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: "call-1", Name: m.toolName, Args: map[string]any{}}}}}, TurnComplete: true}, nil)
	}
}

func TestMCPMetadataAndConnectionsFollowRunLifetime(t *testing.T) {
	for _, name := range []string{"kroger", "travel"} {
		t.Run(name, func(t *testing.T) {
			var mu sync.Mutex
			var metas []map[string]any
			var authorizations []string
			initializations, deletions := 0, 0
			server := mcp.NewServer(&mcp.Implementation{Name: "fixture", Version: "1"}, nil)
			mcp.AddTool(server, &mcp.Tool{Name: "get_weekly_deals", Description: "fixture"}, func(_ context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, map[string]any, error) {
				mu.Lock()
				metas = append(metas, req.Params.Meta)
				mu.Unlock()
				return nil, map[string]any{"ok": true}, nil
			})
			handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true})
			httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				if req.Method == http.MethodPost {
					// Preserve the body while inspecting method/authorization.
					var body map[string]any
					if err := json.UnmarshalRead(req.Body, &body); err != nil {
						t.Error(err)
						return
					}
					encoded, err := json.Marshal(body)
					if err != nil {
						t.Error(err)
						return
					}
					_ = req.Body.Close()
					req.Body = io.NopCloser(strings.NewReader(string(encoded)))
					mu.Lock()
					if body["method"] == "initialize" {
						initializations++
					}
					if body["method"] == "tools/call" {
						authorizations = append(authorizations, req.Header.Get("Authorization"))
					}
					mu.Unlock()
				}
				if req.Method == http.MethodDelete {
					mu.Lock()
					deletions++
					mu.Unlock()
				}
				handler.ServeHTTP(w, req)
			}))
			defer httpServer.Close()
			var set tool.Toolset
			var closeShared func() error
			if name == "kroger" {
				set = grocery.NewKroger(httpServer.Client(), httpServer.URL)
			} else {
				trvl := travel.NewTRVL(httpServer.URL, httpServer.Client())
				set, closeShared = trvl, trvl.Close
				defer func() { _ = closeShared() }()
			}
			built, err := llmagent.New(llmagent.Config{Name: "mcp_fixture", Model: callModel{toolName: "get_weekly_deals"}, Toolsets: []tool.Toolset{set}})
			if err != nil {
				t.Fatal(err)
			}
			rn, err := runner.New(runner.Config{AppName: built.Name(), Agent: built, SessionService: session.InMemoryService(), AutoCreateSession: true})
			if err != nil {
				t.Fatal(err)
			}
			for index, token := range []string{"token-a", "token-b"} {
				traceID := trace.TraceID{1, byte(index + 1)}
				sc := trace.NewSpanContext(trace.SpanContextConfig{TraceID: traceID, SpanID: trace.SpanID{2}, TraceFlags: trace.FlagsSampled})
				ctx, closeRun := mcpruntime.WithScope(trace.ContextWithSpanContext(t.Context(), sc))
				for _, err := range rn.Run(ctx, "user", token, genai.NewContentFromText("lookup", genai.RoleUser), agent.RunConfig{}, runner.WithStateDelta(map[string]any{"temp:kroger_token": token})) {
					if err != nil {
						_ = closeRun()
						t.Fatal(err)
					}
				}
				if err := closeRun(); err != nil {
					t.Fatal(err)
				}
				if err := closeRun(); err != nil {
					t.Fatal(err)
				}
			}
			if closeShared != nil {
				if err := closeShared(); err != nil {
					t.Fatal(err)
				}
				if err := closeShared(); err != nil {
					t.Fatal(err)
				}
			}
			mu.Lock()
			defer mu.Unlock()
			wantConnections := 2
			if name == "travel" {
				wantConnections = 1
			}
			if initializations != wantConnections || deletions != wantConnections {
				t.Errorf("connections opened/closed = %d/%d, want %d", initializations, deletions, wantConnections)
			}
			if len(metas) != 2 || metas[0]["agents/invocation_id"] == metas[1]["agents/invocation_id"] || metas[0]["traceparent"] == metas[1]["traceparent"] {
				t.Fatalf("metadata = %#v", metas)
			}
			for _, meta := range metas {
				if meta["agents/agent"] != "mcp_fixture" || !strings.HasPrefix(meta["traceparent"].(string), "00-") {
					t.Errorf("metadata = %#v", meta)
				}
			}
			if name == "kroger" && (len(authorizations) != 2 || authorizations[0] != "Bearer token-a" || authorizations[1] != "Bearer token-b") {
				t.Errorf("wrong token isolation")
			}
		})
	}
}

func TestScopeRefusesUseAfterCloseOrCancellation(t *testing.T) {
	ctx, closeRun := mcpruntime.WithScope(t.Context())
	if err := closeRun(); err != nil {
		t.Fatal(err)
	}
	create := func() (tool.Toolset, error) { t.Error("constructor called after closure"); return nil, nil }
	if _, err := mcpruntime.Toolset(ctx, "fixture", create); err == nil {
		t.Fatal("closed scope accepted a new connection")
	}
	ctx, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := mcpruntime.Toolset(ctx, "fixture", create); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled scope: %v", err)
	}
}
