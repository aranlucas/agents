package main

import (
	"context"
	"encoding/json"
	"io"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/resume"
	"github.com/aranlucas/agents/agents/internal/config"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// fakeResumeModel is a minimal model.LLM double satisfying resume.New's
// signature; the routing tests below never trigger a model call.
type fakeResumeModel struct{}

func (fakeResumeModel) Name() string { return "fake-resume-model" }

func (fakeResumeModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "ok"}}}, TurnComplete: true}, nil)
	}
}

// fakeHealth is a healthChecker double so tests never touch real D1/R2.
type fakeHealth struct{ err error }

func (f fakeHealth) Health(context.Context) error { return f.err }

func newGateway(t *testing.T) http.Handler {
	t.Helper()
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatalf("build resume agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route:   "resume",
		AppName: resume.AppName,
		Agent:   resumeAgent,
		Public:  true,
		Timeout: 5 * time.Second,
		Health:  resumeHealth(fakeResumeModel{}),
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	sessions := session.InMemoryService()
	// assertRoute's POST fixture body always carries threadId
	// "route-test-thread"; pre-create the matching session (public/
	// anonymous identity, so the D1-shaped user ID is "anon:<threadId>",
	// see effectiveUserID in internal/agui/handler.go) so
	// /resume/agents/state exercises its normal "thread exists" path
	// instead of a lookup error. session.InMemoryService's not-found error
	// isn't cloudflare.ErrSessionNotFound (that sentinel is specific to
	// the production cloudflare.SessionService StateHandler is built
	// against), so relying on the not-found branch here would instead hit
	// StateHandler's genuine-error 500 path.
	if _, err := sessions.Create(context.Background(), &session.CreateRequest{
		AppName: resume.AppName, UserID: "anon:route-test-thread", SessionID: "route-test-thread",
	}); err != nil {
		t.Fatalf("seed route-test-thread session: %v", err)
	}

	cfg := config.Config{HTTP: config.HTTP{Origins: []string{"http://localhost:3000"}}}
	handler, err := New(cfg, Dependencies{
		Registry: registry,
		Sessions: sessions,
		D1:       fakeHealth{},
		R2:       fakeHealth{},
		Now:      time.Now,
	})
	if err != nil {
		t.Fatalf("build gateway: %v", err)
	}
	return handler
}

func TestGatewayRegistersOnlyScopedStateRoutes(t *testing.T) {
	h := newGateway(t)
	assertRoute(t, h, http.MethodGet, "/resume/health", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/resume/agui/capabilities", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/resume/agents/state", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agents/state", http.StatusNotFound)
}

func TestGatewayRejectsUnauthenticatedNonPublicRoute(t *testing.T) {
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatalf("build resume agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "travel", AppName: "travel_agent", Agent: resumeAgent, Public: false, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	cfg := config.Config{HTTP: config.HTTP{Origins: []string{"http://localhost:3000"}}}
	handler, err := New(cfg, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Now: time.Now})
	if err != nil {
		t.Fatalf("build gateway: %v", err)
	}
	assertRoute(t, handler, http.MethodPost, "/travel/agui", http.StatusUnauthorized)
	assertRoute(t, handler, http.MethodPost, "/travel/agents/state", http.StatusUnauthorized)
	// Capabilities and health are metadata, not user data: never gated.
	assertRoute(t, handler, http.MethodGet, "/travel/health", http.StatusOK)
	assertRoute(t, handler, http.MethodGet, "/travel/agui/capabilities", http.StatusOK)
}

func TestGatewayRootHealthChecksD1AndR2WithoutCredentials(t *testing.T) {
	h := newGateway(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	checks, ok := got["checks"].(map[string]any)
	if !ok || checks["d1"] != "ok" || checks["r2"] != "ok" {
		t.Fatalf("checks = %#v", got["checks"])
	}
	for _, forbidden := range []string{"token", "secret", "key", "credential"} {
		if strings.Contains(strings.ToLower(rr.Body.String()), forbidden) {
			t.Fatalf("health response leaked a credential-shaped field: %s", rr.Body.String())
		}
	}
}

func TestGatewayRootHealthReportsDegradedOnFailingCheck(t *testing.T) {
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "resume", AppName: resume.AppName, Agent: resumeAgent, Public: true, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{HTTP: config.HTTP{Origins: nil}}
	handler, err := New(cfg, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(),
		D1: fakeHealth{err: context.DeadlineExceeded}, R2: fakeHealth{}, Now: time.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertRoute(t, handler, http.MethodGet, "/health", http.StatusServiceUnavailable)
}

func assertRoute(t *testing.T, h http.Handler, method, path string, want int) {
	t.Helper()
	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader(`{"threadId":"route-test-thread"}`)
	}
	req := httptest.NewRequest(method, path, body)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != want {
		t.Fatalf("%s %s = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
	}
}
