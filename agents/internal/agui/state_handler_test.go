package agui

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/session"
)

func testResumeRegistry(t *testing.T) *agentruntime.Registry {
	t.Helper()
	a, err := llmagent.New(llmagent.Config{Name: "resume_agent", Instruction: "test resume agent", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatalf("build agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "resume", AppName: "resume_agent", Agent: a, Public: true, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	return registry
}

func TestStateHandlerReturnsPersistedStateForExistingThread(t *testing.T) {
	sessions := newFakeSessionService()
	_, err := sessions.Create(context.Background(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "anon:thread-state", SessionID: "thread-state",
		State: map[string]any{"favorite_color": "blue"},
	})
	if err != nil {
		t.Fatal(err)
	}

	h := StateHandler(testResumeRegistry(t), sessions)
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{"threadId":"thread-state"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	var got stateResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.ThreadExists || got.State["favorite_color"] != "blue" || got.ThreadID != "thread-state" {
		t.Fatalf("response = %#v", got)
	}
	if got.Messages == nil {
		t.Fatal("messages should be an empty array, not null")
	}
}

func TestStateHandlerReportsMissingThreadWithoutError(t *testing.T) {
	h := StateHandler(testResumeRegistry(t), newFakeSessionService())
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{"threadId":"missing-thread"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	var got stateResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ThreadExists {
		t.Fatal("threadExists = true for a session that was never created")
	}
}

func TestStateHandlerRejectsMissingThreadID(t *testing.T) {
	h := StateHandler(testResumeRegistry(t), newFakeSessionService())
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rr.Code)
	}
}

func TestStateHandlerNeverLeaksTemporaryState(t *testing.T) {
	sessions := newFakeSessionService()
	// fakeSessionService.Create (unlike the production cloudflare.SessionService)
	// does not strip temp: keys at write time, so this exercises
	// StateHandler's own persistentSnapshot filtering rather than relying on
	// the store to have already dropped the key.
	_, err := sessions.Create(context.Background(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "anon:thread-temp", SessionID: "thread-temp",
		State: map[string]any{"favorite_color": "blue", "temp:oauth": "never-store"},
	})
	if err != nil {
		t.Fatal(err)
	}

	h := StateHandler(testResumeRegistry(t), sessions)
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{"threadId":"thread-temp"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if strings.Contains(rr.Body.String(), "never-store") {
		t.Fatalf("temporary state leaked: %s", rr.Body.String())
	}
	var got stateResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.State["favorite_color"] != "blue" {
		t.Fatalf("persistent state missing: %#v", got.State)
	}
}
