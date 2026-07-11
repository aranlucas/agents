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

func TestNewADKAgentRequiresExplicitSessionChoice(t *testing.T) {
	ag, err := llmagent.New(llmagent.Config{Name: "demo", Instruction: "demo", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewADKAgent(ADKAgentConfig{Agent: ag}); err == nil {
		t.Fatal("expected missing session service error")
	}
}
