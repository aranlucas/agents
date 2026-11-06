package common

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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

// Every Load owns its transport, so keepalive sockets must not outlive the call.
// Observe the server connection rather than inspecting transport internals.
func TestWebLoaderReleasesConnections(t *testing.T) {
	for _, scenario := range []struct {
		name      string
		status    int
		body      string
		wantError bool
	}{
		{name: "success", status: http.StatusOK, body: "page"},
		{name: "upstream error", status: http.StatusBadGateway, body: "unavailable", wantError: true},
		{name: "response limit", status: http.StatusOK, body: strings.Repeat("x", 2048), wantError: true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			closed := make(chan struct{}, 1)
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(scenario.status)
				_, _ = w.Write([]byte(scenario.body))
			}))
			server.Config.ConnState = func(_ net.Conn, state http.ConnState) {
				if state == http.StateClosed {
					select {
					case closed <- struct{}{}:
					default:
					}
				}
			}
			server.StartTLS()
			defer server.Close()
			loader := NewWebLoader(&HTTPClient{Client: server.Client(), MaxBody: 1024}, 100)
			loader.allowPrivate = true
			_, err := loader.Load(t.Context(), server.URL)
			if (err != nil) != scenario.wantError {
				t.Fatalf("Load error = %v; want error %v", err, scenario.wantError)
			}
			select {
			case <-closed:
			case <-time.After(3 * time.Second):
				t.Fatal("Load left its connection open")
			}
		})
	}
}
