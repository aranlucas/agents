package presentation

import (
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/aranlucas/agents/internal/bravesearch"
)

func TestPresentationToolsExposeOnlyAtomicMutationTools(t *testing.T) {
	tools, err := presentationTools(nil)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tools))
	for _, item := range tools {
		names = append(names, item.Name())
	}
	if !slices.Equal(names, []string{"build_presentation", "revise_presentation"}) {
		t.Fatalf("tool names = %v", names)
	}
}

func TestPresentationToolsExposeWebSearchWhenConfigured(t *testing.T) {
	server := httptest.NewServer(nil)
	t.Cleanup(server.Close)
	search, err := bravesearch.New(server.Client(), server.URL, "test-key", 10)
	if err != nil {
		t.Fatal(err)
	}
	tools, err := presentationTools(search)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tools))
	for _, item := range tools {
		names = append(names, item.Name())
	}
	if !slices.Equal(names, []string{"build_presentation", "revise_presentation", "web_search"}) {
		t.Fatalf("tool names = %v", names)
	}
}
