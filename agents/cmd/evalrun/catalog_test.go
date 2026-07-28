package main

import (
	"slices"
	"testing"
)

func TestEvalAgentRoutesComeFromCatalog(t *testing.T) {
	routes := evalAgentRoutes()
	if len(routes) != 11 || slices.Contains(routes, "trends") {
		t.Fatalf("eval routes = %#v, want eleven dataset-backed catalog routes", routes)
	}
}
