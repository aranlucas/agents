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
