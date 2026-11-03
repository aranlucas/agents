package catalog

import (
	"slices"
	"testing"
)

func TestSurfaceSelectionsRemainStable(t *testing.T) {
	eval := routes(Eval())
	if slices.Contains(eval, "trends") {
		t.Fatalf("Eval routes unexpectedly contain trends: %#v", eval)
	}
	if len(eval) != 9 {
		t.Fatalf("Eval routes = %#v, want 9 routes", eval)
	}
}

func TestByRoute(t *testing.T) {
	if _, ok := ByRoute("oralboards"); ok {
		t.Fatal("removed oralboards route is still registered")
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
