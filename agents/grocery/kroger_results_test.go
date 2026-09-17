package grocery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"agents/travel"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/toolconfirmation"
)

type mcpResultContext struct{ agent.StrictContextMock }

func (*mcpResultContext) ToolConfirmation() *toolconfirmation.ToolConfirmation { return nil }

// Both production toolsets must preserve framework-rendered results, including
// empty successes and resource/media content that older ADK versions discarded.
func TestMCPFrameworkResults(t *testing.T) {
	for _, tc := range []struct {
		name    string
		content []mcp.Content
		want    string
	}{
		{name: "empty text", content: []mcp.Content{&mcp.TextContent{Text: ""}}, want: ""},
		{name: "resource", content: []mcp.Content{&mcp.ResourceLink{URI: "https://example.com/details", Name: "details"}}, want: "https://example.com/details"},
		{name: "image", content: []mcp.Content{&mcp.ImageContent{MIMEType: "image/png", Data: []byte{1, 2, 3}}}, want: `MCP image: mimeType="image/png", size=3 bytes`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := mcp.NewServer(&mcp.Implementation{Name: "results", Version: "1"}, nil)
			server.AddTool(&mcp.Tool{Name: "get_weekly_deals", Description: "Fixture", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				return &mcp.CallToolResult{Content: tc.content}, nil
			})
			httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: true}))
			t.Cleanup(httpServer.Close)
			for name, toolset := range map[string]tool.Toolset{
				"kroger": NewKroger(httpServer.Client(), httpServer.URL),
				"travel": travel.NewTRVL(httpServer.URL, httpServer.Client()),
			} {
				t.Run(name, func(t *testing.T) {
					discovered, err := toolset.Tools(groceryReadonlyContext{Context: t.Context(), state: groceryState{"temp:kroger_token": "fixture-token"}})
					if err != nil || len(discovered) != 1 {
						t.Fatalf("tools = %#v, %v", discovered, err)
					}
					callable, ok := discovered[0].(interface {
						Run(agent.Context, any) (map[string]any, error)
					})
					if !ok {
						t.Fatal("MCP tool is not callable")
					}
					ctx := &mcpResultContext{StrictContextMock: agent.NewStrictContextMock(t.Context())}
					result, err := callable.Run(ctx, map[string]any{})
					if err != nil {
						t.Fatal(err)
					}
					output, ok := result["output"].(string)
					if !ok || !strings.Contains(output, tc.want) || tc.want == "" && output != "" {
						t.Fatalf("output = %#v, want %q", result, tc.want)
					}
				})
			}
		})
	}
}
