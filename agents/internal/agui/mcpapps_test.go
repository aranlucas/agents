package agui

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestActivityContentKeepsValidatedToolInputAsJSON(t *testing.T) {
	input := json.RawMessage(`{"shape":"rectangle"}`)
	content, err := activityContent(&mcp.CallToolResult{}, "excalidraw", "hash", "ui://view", input)
	if err != nil {
		t.Fatal(err)
	}
	if len(content) == 0 || content[0] != '{' {
		t.Fatalf("activity content is not an embedded JSON object: %s", content)
	}
	var payload activityPayload
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatal(err)
	}
	if string(payload.ToolInput) != string(input) {
		t.Fatalf("ToolInput = %s", payload.ToolInput)
	}
}

func TestActivityContentRejectsInvalidOrNullJSON(t *testing.T) {
	for name, test := range map[string]struct {
		result *mcp.CallToolResult
		input  json.RawMessage
	}{
		"nil result":    {result: nil, input: json.RawMessage(`{}`)},
		"invalid input": {result: &mcp.CallToolResult{}, input: json.RawMessage(`{`)},
		"null input":    {result: &mcp.CallToolResult{}, input: json.RawMessage(`null`)},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := activityContent(test.result, "excalidraw", "hash", "ui://view", test.input); err == nil {
				t.Fatal("invalid activity content was accepted")
			}
		})
	}
}

func TestSecureMCPEndpoint(t *testing.T) {
	got, err := secureMCPEndpoint("https://mcp.excalidraw.com")
	if err != nil || got != "https://mcp.excalidraw.com/mcp" {
		t.Fatalf("got %q, %v", got, err)
	}
	for _, endpoint := range []string{"http://mcp.excalidraw.com/mcp", "https://user:secret@mcp.excalidraw.com/mcp"} {
		if _, err := secureMCPEndpoint(endpoint); err == nil {
			t.Fatalf("expected %q to be rejected", endpoint)
		}
	}
	if _, err := NewMCPApps([]MCPAppsServer{{URL: "http://localhost:8080", ServerID: "test"}}, &http.Client{}); err != nil {
		t.Fatalf("loopback endpoint: %v", err)
	}
}

func TestNewMCPAppsRequiresServerID(t *testing.T) {
	if _, err := NewMCPApps([]MCPAppsServer{{URL: "https://mcp.excalidraw.com/mcp"}}, &http.Client{}); err == nil {
		t.Fatal("expected missing ServerID to be rejected")
	}
	if _, err := NewMCPApps(nil, &http.Client{}); err == nil {
		t.Fatal("expected empty server list to be rejected")
	}
	if _, err := NewMCPApps([]MCPAppsServer{
		{URL: "https://mcp.excalidraw.com/mcp", ServerID: "dup"},
		{URL: "https://mcp.excalidraw.com/mcp", ServerID: "dup"},
	}, &http.Client{}); err == nil {
		t.Fatal("expected duplicate ServerID to be rejected")
	}
}

func TestToolVisibilityAndResourceMetadata(t *testing.T) {
	if modelVisible(mcp.Meta{"ui": map[string]any{"visibility": []any{"app"}}}) {
		t.Fatal("app-only tool must not be visible to the model")
	}
	const testResourceURI = "ui://test/mcp-app.html"
	meta := mcp.Meta{"ui": map[string]any{"resourceUri": testResourceURI, "visibility": []any{"model", "app"}}}
	if !modelVisible(meta) || resourceURI(meta) != testResourceURI {
		t.Fatalf("metadata not recognized: %#v", meta)
	}
}

func TestForwardedRequestFailsClosedBeforeNetwork(t *testing.T) {
	bridge, err := NewMCPApps([]MCPAppsServer{{URL: "https://mcp.excalidraw.com/mcp", ServerID: "excalidraw"}}, &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	result, handled, err := bridge.HandleForwarded(t.Context(), json.RawMessage(`{"__proxiedMCPRequest":{"serverId":"attacker","serverHash":"`+bridge.servers["excalidraw"].hash+`","method":"tools/call","params":{"name":"create_view"}}}`))
	if !handled || err == nil || result != nil {
		t.Fatalf("result=%#v handled=%v err=%v", result, handled, err)
	}
}

func TestForwardedRequestRejectsInvalidOrNullJSONWithoutNetwork(t *testing.T) {
	bridge, err := NewMCPApps([]MCPAppsServer{{URL: "https://mcp.excalidraw.com/mcp", ServerID: "excalidraw"}}, &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	for name, props := range map[string]json.RawMessage{"invalid": json.RawMessage(`{`), "null": json.RawMessage(`null`)} {
		t.Run(name, func(t *testing.T) {
			result, handled, err := bridge.HandleForwarded(t.Context(), props)
			if handled || err != nil || result != nil {
				t.Fatalf("result=%s handled=%v err=%v", result, handled, err)
			}
		})
	}
}
