package agui

import (
	"bytes"
	"context"
	json "encoding/json/v2"
	"errors"
	"io"
	"iter"
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
	"google.golang.org/genai"
)

type runtimeTestVerifier struct{}

type headerSignalRecorder struct {
	*httptest.ResponseRecorder
	once        sync.Once
	wroteHeader chan struct{}
}

type failingStreamWriter struct {
	header    http.Header
	body      bytes.Buffer
	status    int
	writes    int
	failAfter int
}

func (w *failingStreamWriter) Header() http.Header { return w.header }
func (w *failingStreamWriter) WriteHeader(status int) {
	w.status = status
}

func (w *failingStreamWriter) Write(payload []byte) (int, error) {
	w.writes++
	if w.writes > w.failAfter {
		return 0, io.ErrClosedPipe
	}
	return w.body.Write(payload)
}
func (*failingStreamWriter) Flush() {}

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

func TestCopilotKitRuntimeConnectRestoresUnresolvedRequestInput(t *testing.T) {
	runtime := testCopilotKitRuntime(t, &fakeReasoningModel{})
	service := runtime.runner.sessions.(*fakeSessionService)
	if _, err := service.Create(t.Context(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "anon:thread-interrupt", SessionID: "thread-interrupt",
	}); err != nil {
		t.Fatal(err)
	}
	service.seedEvents("resume_agent", "anon:thread-interrupt", "thread-interrupt", &session.Event{
		RequestedInput: &session.RequestInput{
			InterruptID: "oralboards-answer-1",
			Message:     "What is your diagnosis?",
			Payload:     map[string]any{"kind": "answer", "question": "What is your diagnosis?"},
		},
	})

	mux := http.NewServeMux()
	runtime.Register(mux)
	connect := httptest.NewRecorder()
	mux.ServeHTTP(connect, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-interrupt","runId":"connect-interrupt","messages":[]}`)))

	body := connect.Body.String()
	if connect.Code != http.StatusOK || !strings.Contains(body, `"type":"interrupt"`) || !strings.Contains(body, `"id":"oralboards-answer-1"`) || !strings.Contains(body, `"kind":"answer"`) {
		t.Fatalf("connect=%d %s", connect.Code, body)
	}
}

type disconnectSurvivalModel struct {
	contexts chan context.Context
	release  chan struct{}
}

func (m *disconnectSurvivalModel) Name() string { return "disconnect-survival-model" }

func (m *disconnectSurvivalModel) GenerateContent(ctx context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		m.contexts <- ctx
		<-m.release
		if err := ctx.Err(); err != nil {
			yield(nil, err)
			return
		}
		yield(&model.LLMResponse{
			Content:      &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Run survived reconnect."}}},
			TurnComplete: true,
		}, nil)
	}
}

type disconnectCancellationModel struct {
	contexts chan context.Context
}

func (*disconnectCancellationModel) Name() string { return "disconnect-cancellation-model" }

func (m *disconnectCancellationModel) GenerateContent(ctx context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		m.contexts <- ctx
		<-ctx.Done()
		yield(nil, ctx.Err())
	}
}

func TestCopilotKitRuntimeSuggestionDisconnectCancelsRun(t *testing.T) {
	model := &disconnectCancellationModel{contexts: make(chan context.Context, 1)}
	runtime := testCopilotKitRuntime(t, model)
	mux := http.NewServeMux()
	runtime.Register(mux)

	request := httptest.NewRequest(http.MethodPost, "/agent/resume/suggest", strings.NewReader(`{"threadId":"thread-suggest-disconnect","runId":"run-suggest-disconnect","messages":[{"id":"user-1","role":"user","content":"suggest"}]}`))
	requestCtx, cancelRequest := context.WithCancel(request.Context())
	request = request.WithContext(requestCtx)
	runDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		runDone <- recorder
	}()

	var runCtx context.Context
	select {
	case runCtx = <-model.contexts:
	case <-time.After(2 * time.Second):
		t.Fatal("suggestion model did not start")
	}
	cancelRequest()

	select {
	case <-runCtx.Done():
		if !errors.Is(runCtx.Err(), context.Canceled) {
			t.Fatalf("suggestion context error = %v, want canceled", runCtx.Err())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("request disconnect did not cancel suggestion run")
	}

	select {
	case run := <-runDone:
		if run.Code != http.StatusOK || strings.Contains(run.Body.String(), "RUN_ERROR") {
			t.Fatalf("suggestion run=%d %s", run.Code, run.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("canceled suggestion run did not finish")
	}
}

func TestCopilotKitRuntimeRequestDisconnectDoesNotCancelActiveRun(t *testing.T) {
	model := &disconnectSurvivalModel{contexts: make(chan context.Context, 1), release: make(chan struct{})}
	runtime := testCopilotKitRuntime(t, model)
	mux := http.NewServeMux()
	runtime.Register(mux)

	request := httptest.NewRequest(http.MethodPost, "/agent/resume/run", strings.NewReader(`{"threadId":"thread-disconnect","runId":"run-disconnect","messages":[{"id":"user-1","role":"user","content":"wait"}]}`))
	requestCtx, cancelRequest := context.WithCancel(request.Context())
	request = request.WithContext(requestCtx)
	runDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		runDone <- recorder
	}()

	var runCtx context.Context
	select {
	case runCtx = <-model.contexts:
	case <-time.After(2 * time.Second):
		t.Fatal("model did not start")
	}
	cancelRequest()
	if err := runCtx.Err(); err != nil {
		t.Fatalf("request disconnect canceled the active run: %v", err)
	}

	key := runKey{AgentRoute: "resume", UserID: "anon:thread-disconnect", ThreadID: "thread-disconnect"}
	if runtime.runner.active.lookup(key) == nil {
		t.Fatal("active run disappeared after request disconnect")
	}
	connectStarted := make(chan struct{})
	connectDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(&headerSignalRecorder{ResponseRecorder: recorder, wroteHeader: connectStarted}, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-disconnect","runId":"connect-disconnect","messages":[]}`)))
		connectDone <- recorder
	}()
	select {
	case <-connectStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("replacement connect did not start")
	}
	close(model.release)

	select {
	case run := <-runDone:
		body := run.Body.String()
		if run.Code != http.StatusOK || !strings.Contains(body, "Run survived reconnect.") || !strings.Contains(body, `"outcome":{"type":"success"}`) {
			t.Fatalf("run=%d %s", run.Code, body)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("detached run did not finish")
	}
	select {
	case connect := <-connectDone:
		frames := parseSSEFrames(t, connect.Body.Bytes())
		assertStrictAGUISequence(t, frames)
		if !strings.Contains(connect.Body.String(), "Run survived reconnect.") {
			t.Fatalf("connect did not replay the successful detached run: %s", connect.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("replacement connect did not finish")
	}
}

func TestCopilotKitRuntimeTransportFailureReconnectsAndFollowsActiveRun(t *testing.T) {
	model := &disconnectSurvivalModel{contexts: make(chan context.Context, 1), release: make(chan struct{})}
	runtime := testCopilotKitRuntime(t, model)
	mux := http.NewServeMux()
	runtime.Register(mux)

	original := &failingStreamWriter{header: make(http.Header), failAfter: 2}
	runDone := make(chan struct{})
	go func() {
		mux.ServeHTTP(original, httptest.NewRequest(http.MethodPost, "/agent/resume/run", strings.NewReader(`{"threadId":"thread-transport","runId":"run-transport","messages":[{"id":"user-1","role":"user","content":"wait"}]}`)))
		close(runDone)
	}()
	var runCtx context.Context
	select {
	case runCtx = <-model.contexts:
	case <-time.After(2 * time.Second):
		t.Fatal("model did not start")
	}

	connectStarted := make(chan struct{})
	connectDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(&headerSignalRecorder{ResponseRecorder: recorder, wroteHeader: connectStarted}, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-transport","runId":"connect-transport","messages":[]}`)))
		connectDone <- recorder
	}()
	select {
	case <-connectStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("connect did not attach")
	}
	if err := runCtx.Err(); err != nil {
		t.Fatalf("active execution was canceled before reconnect follow: %v", err)
	}
	close(model.release)

	select {
	case <-runDone:
	case <-time.After(2 * time.Second):
		t.Fatal("detached run did not finish after original transport failed")
	}
	if original.writes <= original.failAfter {
		t.Fatalf("original transport did not fail: writes=%d", original.writes)
	}
	select {
	case connect := <-connectDone:
		frames := parseSSEFrames(t, connect.Body.Bytes())
		assertStrictAGUISequence(t, frames)
		body := connect.Body.String()
		if !strings.Contains(body, "RUN_STARTED") || !strings.Contains(body, "Run survived reconnect.") || !strings.Contains(body, "RUN_FINISHED") {
			t.Fatalf("connect did not replay and follow successful run: %s", body)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("connect did not reach terminal event")
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
