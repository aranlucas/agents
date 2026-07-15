package agui

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
)

type runtimeTestVerifier struct{}

type headerSignalRecorder struct {
	*httptest.ResponseRecorder
	once        sync.Once
	wroteHeader chan struct{}
}

func (r *headerSignalRecorder) WriteHeader(statusCode int) {
	r.once.Do(func() { close(r.wroteHeader) })
	r.ResponseRecorder.WriteHeader(statusCode)
}

func (runtimeTestVerifier) Verify(context.Context, string) (auth.Identity, error) {
	return auth.Identity{UserID: "user-123"}, nil
}

func testCopilotKitRuntime(t *testing.T, llm model.LLM) *CopilotKitRuntime {
	t.Helper()
	agent, err := llmagent.New(llmagent.Config{Name: "resume_agent", Instruction: "test", Model: llm})
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "resume", AppName: "resume_agent", Agent: agent, Public: true, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := NewCopilotKitRuntime(registry, newFakeSessionService(), func(string) string { return "resume" }, WithTextStreamSmoothing(false, "word", 0, 64))
	if err != nil {
		t.Fatal(err)
	}
	return runtime
}

func TestCopilotKitRuntimeInfoAdvertisesBoundAgents(t *testing.T) {
	runtime := testCopilotKitRuntime(t, &fakeReasoningModel{})
	mux := http.NewServeMux()
	runtime.Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/info", nil))

	var response runtimeInfoResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	agent, ok := response.Agents["resume"]
	if recorder.Code != http.StatusOK || !ok || agent.ClassName != "ADKGoAgent" || response.Version != CopilotKitRuntimeVersion || response.Mode != "sse" {
		t.Fatalf("status=%d response=%#v", recorder.Code, response)
	}
	if !agent.Capabilities.Transport.Streaming || !agent.Capabilities.State.PersistentState || !agent.Capabilities.Tools.ClientProvided {
		t.Fatalf("capabilities=%#v", agent.Capabilities)
	}
	if !response.ThreadEndpoints.List || response.ThreadEndpoints.Inspect || response.ThreadEndpoints.Mutations || response.ThreadEndpoints.RealtimeMetadata {
		t.Fatalf("thread endpoints=%#v", response.ThreadEndpoints)
	}
}

func TestCopilotKitRuntimeListsD1BackedThreads(t *testing.T) {
	runtime := testCopilotKitRuntime(t, &fakeReasoningModel{})
	service := runtime.runner.sessions.(*fakeSessionService)
	for _, seed := range []struct {
		user, id, name string
	}{
		{user: "user-123", id: "thread-plan", name: "Plan Japan"},
		{user: "user-123", id: "thread-unnamed"},
		{user: "other-user", id: "thread-private", name: "Private"},
	} {
		state := map[string]any{}
		if seed.name != "" {
			state[sessionNameStateKey] = seed.name
		}
		if _, err := service.Create(t.Context(), &session.CreateRequest{
			AppName: "resume_agent", UserID: seed.user, SessionID: seed.id, State: state,
		}); err != nil {
			t.Fatal(err)
		}
	}

	mux := http.NewServeMux()
	runtime.Register(mux)
	handler := auth.RequireIdentity(map[string]bool{}, mux, runtimeTestVerifier{})
	request := httptest.NewRequest(http.MethodGet, "/threads?agentId=resume", nil)
	request.Header.Set("Authorization", "Bearer test")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	var response runtimeThreadsResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK || len(response.Threads) != 2 || response.NextCursor != nil {
		t.Fatalf("status=%d response=%#v", recorder.Code, response)
	}
	byID := make(map[string]runtimeThread, len(response.Threads))
	for _, thread := range response.Threads {
		byID[thread.ID] = thread
	}
	if thread := byID["thread-plan"]; thread.Name == nil || *thread.Name != "Plan Japan" || thread.AgentID != "resume" || thread.CreatedByID != "user-123" {
		t.Fatalf("named thread=%#v", thread)
	}
	if thread := byID["thread-unnamed"]; thread.Name != nil || thread.UpdatedAt == "" {
		t.Fatalf("unnamed thread=%#v", thread)
	}
	if _, leaked := byID["thread-private"]; leaked {
		t.Fatal("another user's thread was returned")
	}
}

func TestCopilotKitRuntimeRunAndConnectReplayPersistedThread(t *testing.T) {
	runtime := testCopilotKitRuntime(t, &fakeReasoningModel{})
	mux := http.NewServeMux()
	runtime.Register(mux)

	run := httptest.NewRecorder()
	mux.ServeHTTP(run, httptest.NewRequest(http.MethodPost, "/agent/resume/run", strings.NewReader(`{"threadId":"thread-replay","runId":"run-1","messages":[{"id":"user-1","role":"user","content":"hello"}]}`)))
	if run.Code != http.StatusOK || !strings.Contains(run.Body.String(), "Here is the answer.") || !strings.Contains(run.Body.String(), `"outcome":{"type":"success"}`) {
		t.Fatalf("run=%d %s", run.Code, run.Body.String())
	}

	connect := httptest.NewRecorder()
	mux.ServeHTTP(connect, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-replay","runId":"connect-1","messages":[]}`)))
	if connect.Code != http.StatusOK || !strings.Contains(connect.Body.String(), "MESSAGES_SNAPSHOT") || !strings.Contains(connect.Body.String(), "Here is the answer.") || !strings.Contains(connect.Body.String(), "STATE_SNAPSHOT") {
		t.Fatalf("connect=%d %s", connect.Code, connect.Body.String())
	}
}

func TestCopilotKitRuntimeStopCancelsAndConnectFollowsActiveRun(t *testing.T) {
	runtime := testCopilotKitRuntime(t, &fakeTimeoutModel{})
	mux := http.NewServeMux()
	runtime.Register(mux)

	runDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/agent/resume/run", strings.NewReader(`{"threadId":"thread-active","runId":"run-active","messages":[{"id":"user-1","role":"user","content":"wait"}]}`)))
		runDone <- recorder
	}()

	key := runKey{AgentRoute: "resume", UserID: "anon:thread-active", ThreadID: "thread-active"}
	deadline := time.Now().Add(2 * time.Second)
	for runtime.runner.active.lookup(key) == nil && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if runtime.runner.active.lookup(key) == nil {
		t.Fatal("run never became active")
	}

	connectStarted := make(chan struct{})
	connectDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(&headerSignalRecorder{ResponseRecorder: recorder, wroteHeader: connectStarted}, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-active","runId":"connect-active","messages":[]}`)))
		connectDone <- recorder
	}()
	select {
	case <-connectStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("connect did not start")
	}

	stop := httptest.NewRecorder()
	stopRequest := httptest.NewRequest(http.MethodPost, "/agent/resume/stop/thread-active", nil)
	mux.ServeHTTP(stop, stopRequest)
	if stop.Code != http.StatusOK || !strings.Contains(stop.Body.String(), `"stopped":true`) {
		t.Fatalf("stop=%d %s", stop.Code, stop.Body.String())
	}

	select {
	case run := <-runDone:
		if !strings.Contains(run.Body.String(), `"code":"canceled"`) {
			t.Fatalf("run did not end with a canceled RUN_ERROR: %s", run.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("run did not stop")
	}
	select {
	case connect := <-connectDone:
		if !strings.Contains(connect.Body.String(), "RUN_STARTED") || !strings.Contains(connect.Body.String(), `"code":"canceled"`) {
			t.Fatalf("connect did not replay the active run: %s", connect.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("connect did not finish after stop")
	}
}
