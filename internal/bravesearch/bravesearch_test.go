package bravesearch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSearchCapsResultsAndNeverLeaksKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Subscription-Token") != "brave-secret" {
			t.Fatal("missing Brave key")
		}
		if request.URL.Query().Get("count") != "2" {
			t.Fatalf("count = %q", request.URL.Query().Get("count"))
		}
		_, _ = w.Write([]byte(`{"web":{"results":[{"title":"A","url":"https://a.example","description":"d"},{"title":"B","url":"https://b.example","description":"e"},{"title":"C","url":"https://c.example","description":"f"}]}}`))
	}))
	defer server.Close()
	search, err := New(server.Client(), server.URL, "brave-secret", 2)
	if err != nil {
		t.Fatal(err)
	}
	results, err := search.Search(context.Background(), "pediatric dentistry", 99)
	if err != nil || len(results) != 2 {
		t.Fatalf("Search() = %#v, %v", results, err)
	}
	if strings.Contains(fmt.Sprint(err), "brave-secret") {
		t.Fatal("secret leaked")
	}
}

func TestSearchRedactsSecretOnRemoteError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "brave-secret", http.StatusUnauthorized)
	}))
	defer server.Close()
	search, _ := New(server.Client(), server.URL, "brave-secret", 2)
	_, err := search.Search(context.Background(), "query", 1)
	if err == nil || strings.Contains(err.Error(), "brave-secret") {
		t.Fatalf("error = %v", err)
	}
}

func TestConcurrentSearchesKeepIndependentQueries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/search" || request.URL.Query().Get("country") != "us" {
			t.Errorf("configured endpoint was not preserved: %s", request.URL)
		}
		_, _ = fmt.Fprintf(w, `{"web":{"results":[{"title":%q,"url":"https://example.com/result"}]}}`, request.URL.Query().Get("q"))
	}))
	t.Cleanup(server.Close)
	search, err := New(server.Client(), server.URL+"/search?country=us", "test-key", 2)
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"first query", "second query"} {
		t.Run(query, func(t *testing.T) {
			t.Parallel()
			for range 10 {
				results, err := search.Search(t.Context(), query, 1)
				if err != nil || len(results) != 1 || results[0].Title != query {
					t.Fatalf("Search(%q) = %#v, %v", query, results, err)
				}
			}
		})
	}
}
