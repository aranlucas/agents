package agui

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"agents/internal/auth"
	"google.golang.org/adk/v2/session"
)

type fixedIdentityVerifier struct{ identity auth.Identity }

func (v fixedIdentityVerifier) Verify(context.Context, string) (auth.Identity, error) {
	return v.identity, nil
}

func TestSessionsHandlerListsOnlyVerifiedUsersSessions(t *testing.T) {
	sessions := session.InMemoryService()
	for _, seed := range []struct{ user, id string }{
		{user: "clerk-user", id: "thread-b"},
		{user: "clerk-user", id: "thread-a"},
		{user: "other-user", id: "private-thread"},
	} {
		if _, err := sessions.Create(t.Context(), &session.CreateRequest{
			AppName: "resume_agent", UserID: seed.user, SessionID: seed.id,
			State: map[string]any{"secret": seed.user, sessionNameStateKey: "Plan Japan"},
		}); err != nil {
			t.Fatal(err)
		}
	}

	handler := auth.RequireIdentity(nil, SessionsHandler(testResumeRegistry(t), sessions), fixedIdentityVerifier{identity: auth.Identity{UserID: "clerk-user"}})
	request := httptest.NewRequest(http.MethodGet, "/resume/agents/sessions", nil)
	request.Header.Set("Authorization", "Bearer session-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var got []sessionSummary
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "thread-a" || got[1].ID != "thread-b" {
		t.Fatalf("sessions = %#v", got)
	}
	if got[0].Name != "Plan Japan" || got[1].Name != "Plan Japan" {
		t.Fatalf("session names = %#v", got)
	}
	if strings.Contains(recorder.Body.String(), "private-thread") || strings.Contains(recorder.Body.String(), "secret") || strings.Contains(recorder.Body.String(), "clerk-user") {
		t.Fatalf("session list leaked scoped data: %s", recorder.Body.String())
	}
}

func TestSessionsHandlerRequiresVerifiedIdentity(t *testing.T) {
	handler := SessionsHandler(testResumeRegistry(t), session.InMemoryService())
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/resume/agents/sessions", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestSessionsHandlerSanitizesBackendErrors(t *testing.T) {
	handler := auth.RequireIdentity(nil, SessionsHandler(testResumeRegistry(t), &erroringSessionService{err: context.DeadlineExceeded}), fixedIdentityVerifier{identity: auth.Identity{UserID: "clerk-user"}})
	request := httptest.NewRequest(http.MethodGet, "/resume/agents/sessions", nil)
	request.Header.Set("Authorization", "Bearer session-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusInternalServerError || recorder.Body.String() != "{\"error\":\"sessions_unavailable\"}\n" {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}
