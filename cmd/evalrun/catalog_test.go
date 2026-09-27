package main

import (
	"slices"
	"testing"
)

func TestEvalAgentRoutesComeFromCatalog(t *testing.T) {
	routes := evalAgentRoutes()
	if len(routes) != 9 || slices.Contains(routes, "trends") {
		t.Fatalf("eval routes = %#v, want ten dataset-backed catalog routes", routes)
	}
}
