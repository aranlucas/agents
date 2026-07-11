package agentruntime

import (
	"slices"
	"strings"
	"testing"
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
)

func testAgent(t *testing.T, name string) agent.Agent {
	t.Helper()
	a, err := llmagent.New(llmagent.Config{Name: name, Instruction: "test"})
	if err != nil {
		t.Fatalf("build test agent %q: %v", name, err)
	}
	return a
}

func TestAllReturnsEveryActiveAgentInStableOrder(t *testing.T) {
	routes := []string{"excalidraw", "travel", "trends", "grocery", "fitness", "wellness", "expense", "oralboards", "presentation", "research", "spreadsheet", "resume"}
	entries := make([]Entry, 0, len(routes))
	for _, route := range routes {
		entries = append(entries, Entry{Route: route, AppName: route + "_agent", Agent: testAgent(t, route+"_runtime")})
	}
	registry, err := NewRegistry(entries...)
	if err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(routes))
	for _, entry := range registry.All() {
		got = append(got, entry.Route)
	}
	want := append([]string(nil), routes...)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("routes=%#v want=%#v", got, want)
	}
}

func TestNewRegistryRejectsInvalidEntries(t *testing.T) {
	cases := map[string]Entry{
		"empty route":      {Route: "", AppName: "app", Agent: testAgentFor(t)},
		"route with slash": {Route: "a/b", AppName: "app", Agent: testAgentFor(t)},
		"missing app name": {Route: "resume", AppName: "", Agent: testAgentFor(t)},
		"missing agent":    {Route: "resume", AppName: "app", Agent: nil},
		"whitespace-only":  {Route: "   ", AppName: "app", Agent: testAgentFor(t)},
	}
	for name, entry := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := NewRegistry(entry); err == nil {
				t.Fatalf("NewRegistry(%#v) succeeded, want error", entry)
			}
		})
	}
}

func TestNewRegistryRejectsDuplicateRoutes(t *testing.T) {
	_, err := NewRegistry(
		Entry{Route: "resume", AppName: "resume_agent", Agent: testAgentFor(t)},
		Entry{Route: "/resume/", AppName: "resume_agent_2", Agent: testAgentFor(t)},
	)
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("NewRegistry() error = %v, want duplicate route rejection", err)
	}
}

func TestNewRegistryTrimsRouteSlashesAndDefaultsTimeout(t *testing.T) {
	registry, err := NewRegistry(Entry{Route: "/resume/", AppName: "resume_agent", Agent: testAgentFor(t)})
	if err != nil {
		t.Fatal(err)
	}
	entry, err := registry.Lookup("resume")
	if err != nil {
		t.Fatal(err)
	}
	if entry.Route != "resume" {
		t.Fatalf("route = %q", entry.Route)
	}
	if entry.Timeout != 2*time.Minute {
		t.Fatalf("timeout = %v, want default 2m", entry.Timeout)
	}
}

func TestLookupTrimsSlashesAndRejectsUnknownRoutes(t *testing.T) {
	registry, err := NewRegistry(Entry{Route: "resume", AppName: "resume_agent", Agent: testAgentFor(t), Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Lookup("/resume/"); err != nil {
		t.Fatalf("Lookup(\"/resume/\") error = %v", err)
	}
	if _, err := registry.Lookup("unknown"); err == nil {
		t.Fatal("Lookup(\"unknown\") succeeded, want error")
	}
}

func TestLookupReturnsIndependentStateDefaultsCopies(t *testing.T) {
	registry, err := NewRegistry(Entry{
		Route: "resume", AppName: "resume_agent", Agent: testAgentFor(t),
		StateDefaults: map[string]any{"user_id": ""},
	})
	if err != nil {
		t.Fatal(err)
	}
	first, err := registry.Lookup("resume")
	if err != nil {
		t.Fatal(err)
	}
	first.StateDefaults["user_id"] = "mutated"

	second, err := registry.Lookup("resume")
	if err != nil {
		t.Fatal(err)
	}
	if second.StateDefaults["user_id"] != "" {
		t.Fatalf("StateDefaults leaked a mutation across Lookup calls: %#v", second.StateDefaults)
	}
}

func TestEntriesReturnsEveryRegisteredRoute(t *testing.T) {
	registry, err := NewRegistry(
		Entry{Route: "resume", AppName: "resume_agent", Agent: testAgentFor(t)},
		Entry{Route: "travel", AppName: "travel_agent", Agent: testAgentFor(t)},
	)
	if err != nil {
		t.Fatal(err)
	}
	entries := registry.Entries()
	if len(entries) != 2 {
		t.Fatalf("Entries() = %#v", entries)
	}
	routes := map[string]bool{}
	for _, entry := range entries {
		routes[entry.Route] = true
	}
	if !routes["resume"] || !routes["travel"] {
		t.Fatalf("routes = %#v", routes)
	}
}

func TestNilRegistryLookupFailsClosed(t *testing.T) {
	var registry *Registry
	if _, err := registry.Lookup("resume"); err == nil {
		t.Fatal("nil registry Lookup() succeeded, want error")
	}
	if entries := registry.Entries(); entries != nil {
		t.Fatalf("nil registry Entries() = %#v, want nil", entries)
	}
}

func testAgentFor(t *testing.T) agent.Agent {
	t.Helper()
	return testAgent(t, "test-agent")
}
