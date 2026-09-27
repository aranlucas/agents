package agui

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
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
	_, err := sessions.Create(t.Context(), &session.CreateRequest{
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
	if !got.ThreadExists || string(got.State["favorite_color"]) != `"blue"` || got.ThreadID != "thread-state" {
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

func TestStateHandlerRejectsMultipleOrOversizedJSONDocuments(t *testing.T) {
	h := StateHandler(testResumeRegistry(t), newFakeSessionService())
	for name, body := range map[string]string{
		"multiple documents": `{"threadId":"first"}{"threadId":"second"}`,
		"oversized":          `{"threadId":"thread-state"}` + strings.Repeat(" ", maximumStateRequestBytes),
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(body))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestStateHandlerNeverLeaksTemporaryState(t *testing.T) {
	sessions := newFakeSessionService()
	// fakeSessionService.Create (unlike the production cloudflare.SessionService)
	// does not strip temp: keys at write time, so this exercises
	// StateHandler's own persistentSnapshot filtering rather than relying on
	// the store to have already dropped the key.
	_, err := sessions.Create(t.Context(), &session.CreateRequest{
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
	if string(got.State["favorite_color"]) != `"blue"` {
		t.Fatalf("persistent state missing: %#v", got.State)
	}
}

// erroringSessionService always fails Get with a non-session.ErrNotFound
// error, standing in for a genuine D1 outage or decode failure — the
// branch StateHandler must distinguish from "no session yet".
type erroringSessionService struct{ err error }

func (e *erroringSessionService) Create(context.Context, *session.CreateRequest) (*session.CreateResponse, error) {
	return nil, e.err
}

func (e *erroringSessionService) Get(context.Context, *session.GetRequest) (*session.GetResponse, error) {
	return nil, e.err
}

func (e *erroringSessionService) List(context.Context, *session.ListRequest) (*session.ListResponse, error) {
	return nil, e.err
}

func (e *erroringSessionService) Delete(context.Context, *session.DeleteRequest) error { return e.err }

func (e *erroringSessionService) AppendEvent(context.Context, session.Session, *session.Event) error {
	return e.err
}

func TestStateHandlerReturns500OnUnexpectedSessionError(t *testing.T) {
	sessions := &erroringSessionService{err: errors.New("D1 request returned HTTP 500 for token sk-live-abc123")}
	h := StateHandler(testResumeRegistry(t), sessions)
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{"threadId":"thread-error"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "sk-live-abc123") || strings.Contains(rr.Body.String(), "D1 request") {
		t.Fatalf("raw backend error leaked to client: %s", rr.Body.String())
	}
	var got map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["error"] == "" {
		t.Fatalf("expected a sanitized error field, got %#v", got)
	}
}

func TestStateHandlerReturnsMessagesFromSessionEvents(t *testing.T) {
	sessions := newFakeSessionService()
	_, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "anon:thread-messages", SessionID: "thread-messages",
	})
	if err != nil {
		t.Fatal(err)
	}

	sessions.seedEvents(
		"resume_agent", "anon:thread-messages", "thread-messages",
		&session.Event{
			ID: "ev-user", Author: "user",
			Content: &genai.Content{Parts: []*genai.Part{
				{Text: "What experience do you have?"},
			}},
		},
		&session.Event{
			ID: "ev-call", Author: "resume_agent",
			Content: &genai.Content{Parts: []*genai.Part{
				{FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "lookup_resume", Args: map[string]any{"query": "experience"}}},
			}},
		},
		&session.Event{
			ID: "ev-result", Author: "resume_agent",
			Content: &genai.Content{Parts: []*genai.Part{
				{FunctionResponse: &genai.FunctionResponse{ID: "call-1", Name: "lookup_resume", Response: map[string]any{"years": float64(5)}}},
			}},
		},
		&session.Event{
			ID: "ev-assistant", Author: "resume_agent",
			Content: &genai.Content{Parts: []*genai.Part{
				{Text: "Five years of experience."},
			}},
		},
	)

	h := StateHandler(testResumeRegistry(t), sessions)
	req := httptest.NewRequest(http.MethodPost, "/resume/agents/state", strings.NewReader(`{"threadId":"thread-messages"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}

	var got stateResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.ThreadExists {
		t.Fatal("expected threadExists = true")
	}
	if len(got.Messages) != 4 {
		t.Fatalf("messages = %#v", got.Messages)
	}

	user := got.Messages[0]
	if user.Role != types.RoleUser {
		t.Fatalf("messages[0].role = %q", user.Role)
	}
	if text, ok := user.ContentString(); !ok || text != "What experience do you have?" {
		t.Fatalf("messages[0].content = %#v", user.Content)
	}

	toolCall := got.Messages[1]
	if toolCall.Role != types.RoleAssistant || len(toolCall.ToolCalls) != 1 {
		t.Fatalf("messages[1] = %#v", toolCall)
	}
	if name := toolCall.ToolCalls[0].Function.Name; name != "lookup_resume" {
		t.Fatalf("messages[1].toolCalls[0].function.name = %q", name)
	}
	if args := toolCall.ToolCalls[0].Function.Arguments; args != `{"query":"experience"}` {
		t.Fatalf("messages[1].toolCalls[0].function.arguments = %q", args)
	}

	toolResult := got.Messages[2]
	if toolResult.Role != types.RoleTool || toolResult.ToolCallID != "call-1" {
		t.Fatalf("messages[2] = %#v", toolResult)
	}
	if resultText, ok := toolResult.ContentString(); !ok || resultText != `{"years":5}` {
		t.Fatalf("messages[2].content = %#v", toolResult.Content)
	}

	assistant := got.Messages[3]
	if assistant.Role != types.RoleAssistant {
		t.Fatalf("messages[3].role = %q", assistant.Role)
	}
	if text, ok := assistant.ContentString(); !ok || text != "Five years of experience." {
		t.Fatalf("messages[3].content = %#v", assistant.Content)
	}
}
