package agui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
)

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
	for runtime.active.lookup(key) == nil && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if runtime.active.lookup(key) == nil {
		t.Fatal("run never became active")
	}

	connectDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/agent/resume/connect", strings.NewReader(`{"threadId":"thread-active","runId":"connect-active","messages":[]}`)))
		connectDone <- recorder
	}()

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
