package catalog_test

import (
	"strings"
	"testing"

	"agents/expense"
	"agents/fitness"
	"agents/grocery"
	"agents/internal/catalog"
	"agents/oralboards"
	"agents/presentation"
	"agents/research"
	"agents/resume"
	"agents/spreadsheet"
	"agents/travel"
	"agents/trends"
	"agents/wellness"
)

func TestCatalogIdentityAndRuntimeInvariants(t *testing.T) {
	seenClientIDs := make(map[string]bool)
	seenRoutes := make(map[string]bool)
	seenAppNames := make(map[string]bool)
	for _, spec := range catalog.All() {
		for label, value := range map[string]string{
			"client ID": spec.ClientID,
			"route":     spec.Route,
			"app name":  spec.AppName,
		} {
			if strings.TrimSpace(value) == "" {
				t.Errorf("catalog %s is empty for %#v", label, spec)
			}
		}
		if seenClientIDs[spec.ClientID] {
			t.Errorf("duplicate client ID %q", spec.ClientID)
		}
		if seenRoutes[spec.Route] {
			t.Errorf("duplicate route %q", spec.Route)
		}
		if seenAppNames[spec.AppName] {
			t.Errorf("duplicate app name %q", spec.AppName)
		}
		if spec.Timeout <= 0 {
			t.Errorf("catalog timeout for %q must be positive", spec.Route)
		}
		seenClientIDs[spec.ClientID] = true
		seenRoutes[spec.Route] = true
		seenAppNames[spec.AppName] = true
	}
}

func TestCatalogAppNamesMatchAuthoredAgents(t *testing.T) {
	appNames := map[string]string{
		"travel": travel.AppName, "grocery": grocery.AppName, "fitness": fitness.AppName,
		"wellness": wellness.AppName, "expense": expense.AppName, "oralboards": oralboards.AppName,
		"trends": trends.AppName, "resume": resume.AppName, "research": research.AppName,
		"spreadsheet": spreadsheet.AppName, "presentation": presentation.AppName,
	}
	for _, spec := range catalog.All() {
		if got := appNames[spec.Route]; got != spec.AppName {
			t.Errorf("catalog app name for %s = %q, authored agent uses %q", spec.Route, spec.AppName, got)
		}
	}
}
