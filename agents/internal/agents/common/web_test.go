package common

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBraveSearchCapsResultsAndNeverLeaksKey(t *testing.T) {
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
	search, err := NewBraveSearch(server.Client(), server.URL, "brave-secret", 2)
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

func TestBraveSearchRedactsSecretOnRemoteError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "brave-secret", http.StatusUnauthorized) }))
	defer server.Close()
	search, _ := NewBraveSearch(server.Client(), server.URL, "brave-secret", 2)
	_, err := search.Search(context.Background(), "query", 1)
	if err == nil || strings.Contains(err.Error(), "brave-secret") {
		t.Fatalf("error = %v", err)
	}
}

func TestWebLoaderBlocksPrivateAndInsecureTargets(t *testing.T) {
	loader := NewWebLoader(nil, 100)
	for _, target := range []string{"http://example.com", "https://127.0.0.1/private", "https://localhost/private"} {
		if _, err := loader.Load(context.Background(), target); err == nil {
			t.Fatalf("Load(%q) succeeded", target)
		}
	}
}

func TestWebLoaderExtractsAndTruncatesHTML(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>Example</title><script>secret()</script></head><body>Hello world and beyond</body></html>`))
	}))
	defer server.Close()
	client := &HTTPClient{Client: server.Client(), MaxBody: 1024}
	loader := NewWebLoader(client, 11)
	loader.allowPrivate = true
	loader.resolver = &net.Resolver{}
	page, err := loader.Load(context.Background(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if page.Title != "Example" || page.Text != "Example\nHel" || !page.Truncated || strings.Contains(page.Text, "secret") {
		t.Fatalf("page = %#v", page)
	}
}

type fixedClock struct{ value time.Time }

func (f fixedClock) Now() time.Time { return f.value }
func TestTodayUsesUTC(t *testing.T) {
	got := Today(fixedClock{time.Date(2026, 7, 10, 23, 0, 0, 0, time.FixedZone("west", -8*3600))})
	if got != "2026-07-11" {
		t.Fatalf("Today() = %q", got)
	}
}
