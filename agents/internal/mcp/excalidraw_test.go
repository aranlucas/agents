package mcp

import (
	"net/http"
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

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
	if _, err := NewExcalidraw("http://localhost:8080", &http.Client{}); err != nil {
		t.Fatalf("loopback endpoint: %v", err)
	}
}

func TestToolVisibilityAndResourceMetadata(t *testing.T) {
	if modelVisible(mcpsdk.Meta{"ui": map[string]any{"visibility": []any{"app"}}}) {
		t.Fatal("app-only tool must not be visible to the model")
	}
	meta := mcpsdk.Meta{"ui": map[string]any{"resourceUri": ExcalidrawResourceURI, "visibility": []any{"model", "app"}}}
	if !modelVisible(meta) || resourceURI(meta) != ExcalidrawResourceURI {
		t.Fatalf("metadata not recognized: %#v", meta)
	}
}

func TestForwardedRequestFailsClosedBeforeNetwork(t *testing.T) {
	bridge, err := NewExcalidraw("https://mcp.excalidraw.com/mcp", &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	result, handled, err := bridge.HandleForwarded(t.Context(), map[string]any{
		"__proxiedMCPRequest": map[string]any{"serverId": "attacker", "serverHash": bridge.serverHash, "method": "tools/call", "params": map[string]any{"name": "create_view"}},
	})
	if !handled || err == nil || result != nil {
		t.Fatalf("result=%#v handled=%v err=%v", result, handled, err)
	}
}
