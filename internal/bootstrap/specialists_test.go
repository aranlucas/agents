package bootstrap

import (
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/catalog"
	"google.golang.org/adk/v2/agent"
)

func TestSpecialistsDriveRegistryAndSurfaceMapsFromCatalog(t *testing.T) {
	specialists := testSpecialists(t)
	registry, err := specialists.Registry()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(registry.Entries()), len(catalog.All()); got != want {
		t.Fatalf("registry entries = %d, want %d", got, want)
	}
	telegram, err := specialists.Agents(catalog.Telegram())
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(telegram), len(catalog.Telegram()); got != want {
		t.Fatalf("Telegram agents = %d, want %d", got, want)
	}
	for _, spec := range catalog.All() {
		entry, err := registry.Lookup(spec.Route)
		if err != nil {
			t.Fatal(err)
		}
		if entry.AppName != spec.AppName || entry.Public != spec.Public || entry.Timeout != spec.Timeout {
			t.Fatalf("registry entry for %s = %#v, spec = %#v", spec.Route, entry, spec)
		}
	}
}

func TestSpecialistsRegistryForBuildsSelectedSurface(t *testing.T) {
	specialists := testSpecialists(t)
	travel, ok := catalog.ByRoute("travel")
	if !ok {
		t.Fatal("travel catalog entry is missing")
	}
	registry, err := specialists.RegistryFor([]catalog.Spec{travel})
	if err != nil {
		t.Fatal(err)
	}
	if got := len(registry.Entries()); got != 1 {
		t.Fatalf("selected registry entries = %d, want 1", got)
	}
	entry, err := registry.Lookup("travel")
	if err != nil {
		t.Fatal(err)
	}
	if entry.AppName != travel.AppName || entry.Public || entry.Timeout != travel.Timeout {
		t.Fatalf("selected travel entry = %#v, spec = %#v", entry, travel)
	}
}

func TestSpecialistsRejectMissingOrMismatchedBindings(t *testing.T) {
	specialists := testSpecialists(t)
	specialists.Travel.Agent = nil
	if _, err := specialists.Registry(); err == nil || !strings.Contains(err.Error(), "travel") {
		t.Fatalf("missing travel error = %v", err)
	}

	specialists = testSpecialists(t)
	specialists.Jobs.Agent = namedAgent(t, "wrong_name")
	if _, err := specialists.Registry(); err == nil || !strings.Contains(err.Error(), "jobs_agent") {
		t.Fatalf("mismatched jobs error = %v", err)
	}

	specialists = testSpecialists(t)
	specialists.Grocery.StateDefaults = nil
	if _, err := specialists.Registry(); err == nil || !strings.Contains(err.Error(), "state defaults") {
		t.Fatalf("missing grocery state defaults error = %v", err)
	}
	// Non-gateway surfaces only need the typed ADK agent binding.
	if _, err := specialists.Agents(catalog.Telegram()); err != nil {
		t.Fatalf("Telegram agents rejected nil state defaults: %v", err)
	}
}

func testSpecialists(t *testing.T) Specialists {
	t.Helper()
	bindings := make(map[string]Binding, len(catalog.All()))
	for _, spec := range catalog.All() {
		bindings[spec.Route] = Binding{Agent: namedAgent(t, spec.AppName), StateDefaults: func() map[string]any { return map[string]any{} }}
	}
	return Specialists{
		Travel: bindings["travel"], Grocery: bindings["grocery"], Fitness: bindings["fitness"],
		Wellness: bindings["wellness"], Expense: bindings["expense"], OralBoards: bindings["oralboards"],
		Trends: bindings["trends"], Research: bindings["research"],
		Jobs: bindings["jobs"], Interview: bindings["interview"],
		Spreadsheet: bindings["spreadsheet"], Presentation: bindings["presentation"],
	}
}

func namedAgent(t *testing.T, name string) agent.Agent {
	t.Helper()
	built, err := agent.New(agent.Config{Name: name})
	if err != nil {
		t.Fatal(err)
	}
	return built
}
