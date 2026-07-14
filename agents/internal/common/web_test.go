package common

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
