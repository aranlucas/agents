package agui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/adk/v2/agent/llmagent"
)

func TestADKAgentOfficialStyleComposition(t *testing.T) {
	ag, err := llmagent.New(llmagent.Config{Name: "demo", Instruction: "demo", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := NewADKAgent(ADKAgentConfig{
		Agent:               ag,
		AppName:             "demo_app",
		UserID:              "demo_user",
		UseInMemoryServices: true,
		Route:               "agui",
	})
	if err != nil {
		t.Fatalf("NewADKAgent: %v", err)
	}
	mux := http.NewServeMux()
	if err := AddADKHTTPHandler(mux, adapter, "/"); err != nil {
		t.Fatalf("AddADKHTTPHandler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"threadId":"thread-1","runId":"run-1","messages":[{"id":"m1","role":"user","content":"hello"}]}`))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"type":"RUN_STARTED"`) {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if adapter.handler.userID != "demo_user" {
		t.Fatalf("user ID = %q", adapter.handler.userID)
	}
}

// TestNewADKAgentRequiresRoute guards against reintroducing a silent route
// default: entry.Route drives requestStateOverlay's provider-connected
// switch, so a caller that forgets to set it must fail loudly rather than
// fall back to "agui" and silently drop kroger_connected/strava_connected.
func TestNewADKAgentRequiresRoute(t *testing.T) {
	ag, err := llmagent.New(llmagent.Config{Name: "demo", Instruction: "demo", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewADKAgent(ADKAgentConfig{Agent: ag, UseInMemoryServices: true}); err == nil {
		t.Fatal("expected missing route error")
	}
}

// TestNewADKAgentPropagatesRoute guards against the regression where every
// gateway-mounted agent's entry.Route silently defaulted to "agui" instead of
// its registry route (e.g. "grocery"), which made requestStateOverlay's
// route switch never match and silently drop kroger_connected/
// strava_connected from every request's state overlay.
func TestNewADKAgentPropagatesRoute(t *testing.T) {
	ag, err := llmagent.New(llmagent.Config{Name: "demo", Instruction: "demo", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := NewADKAgent(ADKAgentConfig{Agent: ag, UseInMemoryServices: true, Route: "grocery"})
	if err != nil {
		t.Fatalf("NewADKAgent: %v", err)
	}
	if adapter.handler.entry.Route != "grocery" {
		t.Fatalf("route = %q, want %q", adapter.handler.entry.Route, "grocery")
	}
}

func TestNewADKAgentRequiresExplicitSessionChoice(t *testing.T) {
	ag, err := llmagent.New(llmagent.Config{Name: "demo", Instruction: "demo", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewADKAgent(ADKAgentConfig{Agent: ag, Route: "agui"}); err == nil {
		t.Fatal("expected missing session service error")
	}
}
