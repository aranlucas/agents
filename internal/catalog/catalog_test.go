package catalog

import (
	"slices"
	"testing"
	"time"
)

func TestAllHasUniqueCompleteMetadata(t *testing.T) {
	seenClientIDs := map[string]bool{}
	seenRoutes := map[string]bool{}
	seenAppNames := map[string]bool{}
	for _, spec := range All() {
		if spec.ClientID == "" || spec.Route == "" || spec.AppName == "" || spec.Timeout < time.Second {
			t.Fatalf("incomplete spec: %#v", spec)
		}
		if seenClientIDs[spec.ClientID] || seenRoutes[spec.Route] || seenAppNames[spec.AppName] {
			t.Fatalf("duplicate identity in spec: %#v", spec)
		}
		seenClientIDs[spec.ClientID] = true
		seenRoutes[spec.Route] = true
		seenAppNames[spec.AppName] = true
	}
	if len(seenRoutes) != 13 {
		t.Fatalf("catalog contains %d agents, want 13", len(seenRoutes))
	}
}

func TestSurfaceSelectionsRemainStable(t *testing.T) {
	telegram := routes(Telegram())
	if slices.Contains(telegram, "jobs") {
		t.Fatalf("Telegram routes unexpectedly contain private web-only jobs agent: %#v", telegram)
	}
	if len(telegram) != 11 {
		t.Fatalf("Telegram routes = %#v, want 11 routes", telegram)
	}

	eval := routes(Eval())
	if slices.Contains(eval, "trends") {
		t.Fatalf("Eval routes unexpectedly contain trends: %#v", eval)
	}
	if len(eval) != 11 {
		t.Fatalf("Eval routes = %#v, want 11 routes", eval)
	}
}

func TestByRoute(t *testing.T) {
	oralBoards, ok := ByRoute("oralboards")
	if !ok || oralBoards.ClientID != "oral-boards" || oralBoards.AppName != "oralboards_agent" {
		t.Fatalf("ByRoute(oralboards) = %#v, %v", oralBoards, ok)
	}
	if _, ok := ByRoute("unknown"); ok {
		t.Fatal("ByRoute(unknown) succeeded")
	}
}

func routes(specs []Spec) []string {
	result := make([]string, 0, len(specs))
	for _, spec := range specs {
		result = append(result, spec.Route)
	}
	return result
}
