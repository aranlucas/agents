package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/config"
	"github.com/railwayapp/railway-go-sdk"
)

// The fixture records the original TypeScript graph plus explicit live volume
// settings, which prevent the CLI from planning a destructive volume reset.
func TestRailwayPreservesInfrastructure(t *testing.T) {
	wantJSON, err := os.ReadFile("testdata/project.json")
	if err != nil {
		t.Fatal(err)
	}
	gotJSON, err := json.Marshal(Railway().Graph())
	if err != nil {
		t.Fatal(err)
	}
	var want, got map[string]any
	if err := json.Unmarshal(wantJSON, &want); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(gotJSON, &got); err != nil {
		t.Fatal(err)
	}
	// The Go SDK emits null for unset optional fields; TypeScript omits
	// networking and emits {} for raw mounts. Neither config owns these.
	// Both attach the named volume through volumeAttachments instead.
	for _, graph := range []map[string]any{want, got} {
		for _, resource := range graph["resources"].([]any) {
			node := resource.(map[string]any)
			mounts, emptyMounts := node["volumeMounts"].(map[string]any)
			if node["volumeMounts"] == nil || (emptyMounts && len(mounts) == 0) {
				delete(node, "volumeMounts")
			}
			if networking, ok := node["networking"].(map[string]any); ok &&
				len(networking) == 2 && networking["customDomains"] == nil && networking["tcpProxies"] == nil {
				delete(node, "networking")
			}
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Railway graph changed:\ngot: %s\nwant: %s", gotJSON, wantJSON)
	}
}

// Omitted variables are planned for deletion; check the evaluated graph so
// this stays accurate even when the authoring source uses helpers or loops.
func TestRailwayDeclaresEveryProductionVariable(t *testing.T) {
	declared := map[string]bool{}
	for _, resource := range Railway().Resources {
		service, ok := resource.(railway.Service)
		if !ok {
			continue
		}
		variables, _ := service.Graph()["variables"].(map[string]any)
		for name := range variables {
			declared[name] = true
		}
	}
	known := map[string]bool{}
	for _, key := range config.Keys {
		known[key.Name] = true
		if key.Railway && !declared[key.Name] {
			t.Errorf("%s is read in production but not declared in .railway/railway.go", key.Name)
		}
	}
	for name := range declared {
		if !known[name] && !strings.HasPrefix(name, "RAILWAY_") {
			t.Errorf(".railway/railway.go declares %s, which the service never reads", name)
		}
	}
}
