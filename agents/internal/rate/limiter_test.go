package rate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"github.com/aranlucas/agents/agents/internal/config"
)

func TestProviderLimiterRejectsWindowOverflowAndResets(t *testing.T) {
	var mu sync.Mutex
	counts := map[int64]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var statements []cloudflare.Statement
		if err := json.NewDecoder(r.Body).Decode(&statements); err != nil {
			t.Fatal(err)
		}
		window := int64(statements[1].Params[1].(float64))
		maximum := int(statements[1].Params[3].(float64))
		mu.Lock()
		counts[window]++
		count := counts[window]
		mu.Unlock()
		rows := []map[string]any{}
		if count <= maximum {
			rows = append(rows, map[string]any{"request_count": count})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": []any{
			map[string]any{"success": true, "results": []any{}, "meta": map[string]any{"changes": 0}},
			map[string]any{"success": true, "results": rows, "meta": map[string]any{"changes": 1}},
		}})
	}))
	defer server.Close()

	d1 := newTestD1(t, server)
	now := time.Date(2026, 7, 10, 12, 0, 20, 0, time.UTC)
	limiter := NewProviderLimiter(d1, func() time.Time { return now })
	for range 2 {
		if err := limiter.Acquire(context.Background(), "groq", 2); err != nil {
			t.Fatal(err)
		}
	}
	if err := limiter.Acquire(context.Background(), "groq", 2); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("Acquire() error = %v", err)
	}
	now = now.Add(time.Minute)
	if err := limiter.Acquire(context.Background(), "groq", 2); err != nil {
		t.Fatalf("new window Acquire() error = %v", err)
	}
}

func TestProviderLimiterRejectsInvalidOrUnavailableConfiguration(t *testing.T) {
	limiter := NewProviderLimiter(nil, time.Now)
	if err := limiter.Acquire(context.Background(), "groq", 1); err == nil {
		t.Fatal("missing D1 accepted")
	}
	if err := limiter.Acquire(context.Background(), "", 1); err == nil {
		t.Fatal("empty provider accepted")
	}
	if err := limiter.Acquire(context.Background(), "groq", 0); err == nil {
		t.Fatal("zero limit accepted")
	}
}

func newTestD1(t *testing.T, server *httptest.Server) *cloudflare.D1 {
	t.Helper()
	// NewD1 is deliberately production-only, so route its transport to the
	// fixture while retaining the real scoped Cloudflare endpoint construction.
	client := server.Client()
	client.Transport = rewriteTransport{target: server.URL, base: client.Transport}
	d1, err := cloudflare.NewD1(config.Cloudflare{AccountID: "account", APIToken: "token", D1DatabaseID: "database"}, client)
	if err != nil {
		t.Fatal(err)
	}
	return d1
}

type rewriteTransport struct {
	target string
	base   http.RoundTripper
}

func (r rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	parsed, _ := clone.URL.Parse(r.target)
	clone.URL = parsed
	return r.base.RoundTrip(clone)
}
