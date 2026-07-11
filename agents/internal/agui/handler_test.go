package agui

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/cloudflare"
	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

// ---- golden test ----------------------------------------------------------

func TestHandlerStreamsResumeGoldenEvents(t *testing.T) {
	h := newGatewayWithFakeResumeModel(t)
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", bytes.NewReader(readFixture(t, "resume-request.json")))
	req.Header.Set("Accept", "text/event-stream")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	assertSSEEqual(t, rr.Body.Bytes(), readFixture(t, "resume-events.jsonl"))
}

// ---- malformed input --------------------------------------------------

func TestHandlerRejectsMalformedInput(t *testing.T) {
	h := newGatewayWithFakeResumeModel(t)

	cases := map[string]string{
		"not json":         `{not valid json`,
		"missing threadId": `{"runId":"run-1","messages":[]}`,
		"missing runId":    `{"threadId":"thread-1","messages":[]}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
			}
			var payload map[string]string
			if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error body: %v", err)
			}
			if payload["error"] != "invalid_agui_input" {
				t.Fatalf("error = %q", payload["error"])
			}
			if strings.Contains(rr.Body.String(), "RUN_STARTED") {
				t.Fatalf("stream should not have started: %s", rr.Body.String())
			}
		})
	}
}

type fakeForwardedHandler struct{}

func (fakeForwardedHandler) HandleForwarded(_ context.Context, props any) (any, bool, error) {
	if props == nil {
		return nil, false, nil
	}
	return map[string]any{"proxied": true}, true, nil
}

func TestHandlerCompletesForwardedRequestWithoutSessionOrModel(t *testing.T) {
	a, err := llmagent.New(llmagent.Config{Name: "excalidraw_agent", Instruction: "unused", Model: &fakeResumeModel{}})
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "excalidraw", AppName: "excalidraw_agent", Agent: a, Public: true,
		Forwarded: fakeForwardedHandler{},
	})
	if err != nil {
		t.Fatal(err)
	}
	body := `{"threadId":"thread-1","runId":"run-1","messages":[],"tools":[],"context":[],"forwardedProps":{"__proxiedMCPRequest":{}}}`
	req := httptest.NewRequest(http.MethodPost, "/excalidraw/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	Handler(registry, nil).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"proxied":true`) || !strings.Contains(rr.Body.String(), "RUN_FINISHED") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

// ---- tool-result resume ------------------------------------------------

func TestHandlerResumesFromPendingClientToolResult(t *testing.T) {
	pending := newFakePending()
	ids := &fakeIDs{}
	h := newTestGateway(t, &fakeResumeModel{}, ids, WithPendingTools(pending))

	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-resume", ThreadID: "thread-resume"}
	if err := pending.Register(context.Background(), scope, "call-9", "remember_fact", map[string]any{"note": "blue"}); err != nil {
		t.Fatalf("register pending: %v", err)
	}

	body := `{
		"threadId": "thread-resume",
		"runId": "run-resume",
		"state": {},
		"messages": [
			{"id": "tool-result-1", "role": "tool", "toolCallId": "call-9", "content": "{\"ok\":true}"}
		],
		"tools": [],
		"context": [],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	out := rr.Body.String()
	if !strings.Contains(out, `"delta":"Got it"`) {
		t.Fatalf("expected streamed resume text, got: %s", out)
	}
	if !strings.Contains(out, "RUN_FINISHED") {
		t.Fatalf("expected RUN_FINISHED, got: %s", out)
	}
	if strings.Contains(out, "RUN_ERROR") {
		t.Fatalf("unexpected RUN_ERROR: %s", out)
	}
}

// ---- reasoning text -----------------------------------------------------

func TestHandlerStreamsReasoningText(t *testing.T) {
	ids := &fakeIDs{}
	h := newTestGateway(t, &fakeReasoningModel{}, ids)

	body := `{
		"threadId": "thread-reason",
		"runId": "run-reason",
		"state": {},
		"messages": [{"id": "user-1", "role": "user", "content": "Think it through."}],
		"tools": [],
		"context": [],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	out := rr.Body.String()
	for _, want := range []string{"REASONING_START", "REASONING_MESSAGE_START", `"delta":"thinking..."`, "REASONING_MESSAGE_END", "REASONING_END", `"delta":"Here is the answer."`} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in output: %s", want, out)
		}
	}
}

// ---- sanitized RUN_ERROR -------------------------------------------------

func TestHandlerEndsWithSanitizedRunErrorOnUpstreamFailure(t *testing.T) {
	const secret = "sk-super-secret-provider-key-should-never-leak"
	ids := &fakeIDs{}
	h := newTestGateway(t, &fakeErrorModel{err: fmt.Errorf("upstream 401 for api key %s", secret)}, ids)

	body := `{
		"threadId": "thread-error",
		"runId": "run-error",
		"state": {},
		"messages": [{"id": "user-1", "role": "user", "content": "Hello"}],
		"tools": [],
		"context": [],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	out := rr.Body.String()
	if strings.Contains(out, secret) {
		t.Fatalf("leaked secret in RUN_ERROR output: %s", out)
	}
	if !strings.Contains(out, "RUN_ERROR") {
		t.Fatalf("expected RUN_ERROR: %s", out)
	}
	if strings.Contains(out, "RUN_FINISHED") {
		t.Fatalf("must not emit RUN_FINISHED after RUN_ERROR: %s", out)
	}
}

// ---- AG-UI client tools reach the running agent (Finding 1a) -------------

// TestHandlerWiresRequestClientToolsIntoRunningAgent proves that an AG-UI
// request's tools declarations become callable tools for that run: the
// agent under test has no static "highlight_row" tool, only a
// RequestScopedClientToolset resolving it dynamically from the request's
// declared tools. If the handler failed to overlay the client tools state
// key before Runner.Run, ADK would fail to find "highlight_row" when the
// fake model calls it and the stream would end in RUN_ERROR instead of
// carrying TOOL_CALL_START/ARGS/END.
func TestHandlerWiresRequestClientToolsIntoRunningAgent(t *testing.T) {
	pending := newFakePending()
	ids := &fakeIDs{}
	h := newTestGatewayWithToolsets(t, &fakeClientToolModel{}, ids, []tool.Toolset{NewRequestScopedClientToolset(pending)}, WithPendingTools(pending))

	body := `{
		"threadId": "thread-highlight",
		"runId": "run-highlight",
		"state": {},
		"messages": [{"id": "user-1", "role": "user", "content": "Highlight row 42."}],
		"tools": [{"name": "highlight_row", "description": "Highlight a table row in the UI.", "parameters": {"type": "object", "properties": {"row": {"type": "string"}}}}],
		"context": [],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	out := rr.Body.String()
	for _, want := range []string{
		`"type":"TOOL_CALL_START","toolCallId":"call-highlight-1","toolCallName":"highlight_row"`,
		`"type":"TOOL_CALL_ARGS","toolCallId":"call-highlight-1"`,
		`"type":"TOOL_CALL_END","toolCallId":"call-highlight-1"`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in output: %s", want, out)
		}
	}
	if strings.Contains(out, "RUN_ERROR") {
		t.Fatalf("unexpected RUN_ERROR (client tool wiring failed): %s", out)
	}
	scope := ToolScope{AppName: "resume_agent", UserID: "anon:thread-highlight", ThreadID: "thread-highlight"}
	if _, ok := pending.pending[key(scope, "call-highlight-1")]; !ok {
		t.Fatalf("expected call-highlight-1 to be registered in the pending store")
	}
}

// TestHandlerRejectsClientToolsWithoutPendingStore proves the handler
// fails a request declaring client tools before starting the SSE stream
// when it has no PendingTools configured — silently running without the
// declared tools would be worse than a clear 400.
func TestHandlerRejectsClientToolsWithoutPendingStore(t *testing.T) {
	ids := &fakeIDs{}
	h := newTestGateway(t, &fakeClientToolModel{}, ids) // no WithPendingTools

	body := `{
		"threadId": "thread-no-pending",
		"runId": "run-no-pending",
		"state": {},
		"messages": [{"id": "user-1", "role": "user", "content": "Highlight row 42."}],
		"tools": [{"name": "highlight_row", "description": "Highlight a table row in the UI.", "parameters": {"type": "object", "properties": {}}}],
		"context": [],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "RUN_STARTED") {
		t.Fatalf("stream should not have started: %s", rr.Body.String())
	}
}

// ---- AG-UI context reaches the model (Finding 1b) -------------------------

// TestHandlerForwardsAGUIContextToModel proves input.context entries
// reach the model's request, not just session state.
func TestHandlerForwardsAGUIContextToModel(t *testing.T) {
	ids := &fakeIDs{}
	captured := &fakeCapturingModel{}
	h := newTestGateway(t, captured, ids)

	body := `{
		"threadId": "thread-context",
		"runId": "run-context",
		"state": {},
		"messages": [{"id": "user-1", "role": "user", "content": "What page am I on?"}],
		"tools": [],
		"context": [{"description": "current_page", "value": "/dashboard/settings"}],
		"forwardedProps": null
	}`
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	req2 := captured.request()
	if req2 == nil {
		t.Fatal("model never received a request")
	}
	var found bool
	for _, content := range req2.Contents {
		if content == nil {
			continue
		}
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if strings.Contains(part.Text, "current_page") && strings.Contains(part.Text, "/dashboard/settings") {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("AG-UI context not present in model request contents: %#v", req2.Contents)
	}
}

// ---- test gateway construction -------------------------------------------

func newGatewayWithFakeResumeModel(t *testing.T) http.Handler {
	t.Helper()
	return newTestGateway(t, &fakeResumeModel{}, &fakeIDs{})
}

func newTestGateway(t *testing.T, m model.LLM, ids aguievents.IDGenerator, opts ...Option) http.Handler {
	t.Helper()
	return newTestGatewayWithToolsets(t, m, ids, nil, opts...)
}

// newTestGatewayWithToolsets is newTestGateway plus the ability to attach
// extra tool.Toolsets (e.g. a RequestScopedClientToolset) to the agent at
// construction time — the same thing production agent wiring must do to
// support AG-UI client tools (see client_tools.go's
// RequestScopedClientToolset doc comment).
func newTestGatewayWithToolsets(t *testing.T, m model.LLM, ids aguievents.IDGenerator, toolsets []tool.Toolset, opts ...Option) http.Handler {
	t.Helper()
	a, err := llmagent.New(llmagent.Config{
		Name:        "resume_agent",
		Instruction: "test resume agent",
		Model:       m,
		Tools:       []tool.Tool{rememberTool(t)},
		Toolsets:    toolsets,
	})
	if err != nil {
		t.Fatalf("build agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route:   "resume",
		AppName: "resume_agent",
		Agent:   a,
		Public:  true,
		Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	sessions := newFakeSessionService()
	allOpts := append([]Option{WithIDGenerator(ids)}, opts...)
	return Handler(registry, sessions, allOpts...)
}

// ---- fake tool ------------------------------------------------------------

type rememberArgs struct {
	Note string `json:"note"`
}

type rememberResult struct {
	OK bool `json:"ok"`
}

func rememberTool(t *testing.T) tool.Tool {
	t.Helper()
	built, err := functiontool.New[rememberArgs, rememberResult](functiontool.Config{
		Name:        "remember_fact",
		Description: "Persist a fact to session state.",
	}, func(ctx agent.Context, args rememberArgs) (rememberResult, error) {
		txn := agentruntime.NewTransactionFromState(ctx.State())
		txn.Set("favorite_color", args.Note)
		if err := agentruntime.Commit(ctx, txn); err != nil {
			return rememberResult{}, err
		}
		return rememberResult{OK: true}, nil
	})
	if err != nil {
		t.Fatalf("build remember_fact tool: %v", err)
	}
	return built
}

// ---- fake models ------------------------------------------------------------

// fakeResumeModel simulates a two-turn tool round trip: the first call
// (fresh contents, no FunctionResponse yet) asks to call remember_fact; the
// second call (contents include a FunctionResponse) streams a short
// confirmation.
type fakeResumeModel struct{}

func (m *fakeResumeModel) Name() string { return "fake-resume-model" }

func (m *fakeResumeModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if hasFunctionResponse(req.Contents) {
			if !yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Got it"}}}, Partial: true}, nil) {
				return
			}
			yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Got it, saved!"}}}, TurnComplete: true}, nil)
			return
		}
		yield(&model.LLMResponse{
			Content: &genai.Content{Role: "model", Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "remember_fact", Args: map[string]any{"note": "blue"}},
			}}},
			TurnComplete: true,
		}, nil)
	}
}

// fakeReasoningModel streams a reasoning delta followed by a plain-text answer.
type fakeReasoningModel struct{}

func (m *fakeReasoningModel) Name() string { return "fake-reasoning-model" }

func (m *fakeReasoningModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if !yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "thinking...", Thought: true}}}, Partial: true}, nil) {
			return
		}
		if !yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Here is the answer."}}}, Partial: true}, nil) {
			return
		}
		yield(&model.LLMResponse{
			Content: &genai.Content{Role: "model", Parts: []*genai.Part{
				{Text: "thinking...", Thought: true},
				{Text: "Here is the answer."},
			}},
			TurnComplete: true,
		}, nil)
	}
}

// fakeErrorModel always fails, simulating an upstream provider failure.
type fakeErrorModel struct{ err error }

func (m *fakeErrorModel) Name() string { return "fake-error-model" }

func (m *fakeErrorModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(nil, m.err)
	}
}

// fakeClientToolModel emits a function call for a tool name that has no
// static ADK tool — only a RequestScopedClientToolset resolving the
// request's AG-UI tool declarations can make this callable. Used to prove
// input.Tools actually reaches the running agent (Finding 1a). Mirrors
// fakeResumeModel's two-turn shape: NewClientToolset's wrapped tool
// returns a non-nil {"status":"pending",...} acknowledgment immediately
// (see client_tools.go), so the *next* LLM turn already has a
// FunctionResponse in its contents — a well-behaved model responds to the
// user instead of reissuing the identical call.
type fakeClientToolModel struct{}

func (m *fakeClientToolModel) Name() string { return "fake-client-tool-model" }

func (m *fakeClientToolModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if hasFunctionResponse(req.Contents) {
			yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "Highlighting row 42."}}}, TurnComplete: true}, nil)
			return
		}
		yield(&model.LLMResponse{
			Content: &genai.Content{Role: "model", Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-highlight-1", Name: "highlight_row", Args: map[string]any{"row": "42"}},
			}}},
			TurnComplete: true,
		}, nil)
	}
}

// fakeCapturingModel records the LLMRequest it receives (so a test can
// assert on req.Contents) and returns a short fixed reply.
type fakeCapturingModel struct {
	mu  sync.Mutex
	got *model.LLMRequest
}

func (m *fakeCapturingModel) Name() string { return "fake-capturing-model" }

func (m *fakeCapturingModel) request() *model.LLMRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.got
}

func (m *fakeCapturingModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	m.mu.Lock()
	m.got = req
	m.mu.Unlock()
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "ok"}}}, TurnComplete: true}, nil)
	}
}

func hasFunctionResponse(contents []*genai.Content) bool {
	for _, content := range contents {
		if content == nil {
			continue
		}
		for _, part := range content.Parts {
			if part != nil && part.FunctionResponse != nil {
				return true
			}
		}
	}
	return false
}

// ---- fake pending client-tool store ---------------------------------------

type fakePendingRecord struct {
	name string
}

type fakePending struct {
	mu       sync.Mutex
	pending  map[string]fakePendingRecord
	resolved map[string]any
}

func newFakePending() *fakePending {
	return &fakePending{pending: make(map[string]fakePendingRecord), resolved: make(map[string]any)}
}

func (p *fakePending) Register(ctx context.Context, scope ToolScope, callID, toolName string, args map[string]any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pending[key(scope, callID)] = fakePendingRecord{name: toolName}
	return nil
}

func (p *fakePending) Resolve(ctx context.Context, identity auth.Identity, app, thread, callID string, result any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	k := app + "\x00" + thread + "\x00" + callID
	if _, ok := p.pending[k]; !ok {
		return ErrPendingToolNotFound
	}
	p.resolved[k] = result
	return nil
}

func (p *fakePending) Take(ctx context.Context, identity auth.Identity, app, thread, callID string) (*genai.FunctionResponse, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	k := app + "\x00" + thread + "\x00" + callID
	record, ok := p.pending[k]
	result, resolvedOK := p.resolved[k]
	if !ok || !resolvedOK {
		return nil, ErrPendingToolNotFound
	}
	delete(p.pending, k)
	delete(p.resolved, k)
	response, ok := result.(map[string]any)
	if !ok {
		response = map[string]any{"result": result}
	}
	return &genai.FunctionResponse{ID: callID, Name: record.name, Response: response}, nil
}

func key(scope ToolScope, callID string) string {
	return scope.AppName + "\x00" + scope.ThreadID + "\x00" + callID
}

// ---- fake session service --------------------------------------------------

type fakeState struct {
	mu     sync.RWMutex
	values map[string]any
}

func newFakeState(initial map[string]any) *fakeState {
	values := make(map[string]any, len(initial))
	for k, v := range initial {
		values[k] = v
	}
	return &fakeState{values: values}
}

func (s *fakeState) Get(key string) (any, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.values[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (s *fakeState) Set(key string, value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[key] = value
	return nil
}

func (s *fakeState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		s.mu.RLock()
		copied := make(map[string]any, len(s.values))
		for k, v := range s.values {
			copied[k] = v
		}
		s.mu.RUnlock()
		for k, v := range copied {
			if !yield(k, v) {
				return
			}
		}
	}
}

type fakeSession struct {
	id, appName, userID string
	state               *fakeState
	mu                  sync.RWMutex
	events              []*session.Event
	updated             time.Time
}

func (s *fakeSession) ID() string             { return s.id }
func (s *fakeSession) AppName() string        { return s.appName }
func (s *fakeSession) UserID() string         { return s.userID }
func (s *fakeSession) State() session.State   { return s.state }
func (s *fakeSession) Events() session.Events { return (*fakeEvents)(s) }
func (s *fakeSession) LastUpdateTime() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.updated
}

type fakeEvents fakeSession

func (e *fakeEvents) All() iter.Seq[*session.Event] {
	return func(yield func(*session.Event) bool) {
		e.mu.RLock()
		events := append([]*session.Event(nil), e.events...)
		e.mu.RUnlock()
		for _, event := range events {
			if !yield(event) {
				return
			}
		}
	}
}
func (e *fakeEvents) Len() int { e.mu.RLock(); defer e.mu.RUnlock(); return len(e.events) }
func (e *fakeEvents) At(i int) *session.Event {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.events[i]
}

// fakeSessionService is an in-memory session.Service double. Unlike
// session.InMemoryService (bundled with ADK-Go), it reproduces the
// production cloudflare.SessionService error contract (returning
// cloudflare.ErrSessionNotFound from Get) that Handler.restoreSession
// depends on, and it keeps a strict separation between the persisted
// backing state and the in-flight session's state so a temp: key applied
// mid-invocation never leaks into a later Get.
type fakeSessionService struct {
	mu        sync.Mutex
	persisted map[string]map[string]any
	events    map[string][]*session.Event
}

func newFakeSessionService() *fakeSessionService {
	return &fakeSessionService{persisted: make(map[string]map[string]any), events: make(map[string][]*session.Event)}
}

// seedEvents installs a session's event history directly, bypassing
// AppendEvent, so tests can exercise message reconstruction (see
// messages.go's eventsToMessages) without driving a full agent run. The
// session must already exist (via Create) for the corresponding Get to
// succeed.
func (f *fakeSessionService) seedEvents(app, user, id string, events ...*session.Event) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events[sessionKey(app, user, id)] = events
}

func sessionKey(app, user, id string) string { return app + "\x00" + user + "\x00" + id }

func (f *fakeSessionService) Create(ctx context.Context, req *session.CreateRequest) (*session.CreateResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := req.SessionID
	if id == "" {
		id = fmt.Sprintf("session-%d", len(f.persisted)+1)
	}
	k := sessionKey(req.AppName, req.UserID, id)
	state := make(map[string]any, len(req.State))
	for key, value := range req.State {
		state[key] = value
	}
	f.persisted[k] = state
	sess := &fakeSession{id: id, appName: req.AppName, userID: req.UserID, state: newFakeState(state), updated: time.Now()}
	return &session.CreateResponse{Session: sess}, nil
}

func (f *fakeSessionService) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := sessionKey(req.AppName, req.UserID, req.SessionID)
	state, ok := f.persisted[key]
	if !ok {
		return nil, cloudflare.ErrSessionNotFound
	}
	events := append([]*session.Event(nil), f.events[key]...)
	sess := &fakeSession{id: req.SessionID, appName: req.AppName, userID: req.UserID, state: newFakeState(state), events: events, updated: time.Now()}
	return &session.GetResponse{Session: sess}, nil
}

func (f *fakeSessionService) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	return &session.ListResponse{}, nil
}

func (f *fakeSessionService) Delete(ctx context.Context, req *session.DeleteRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.persisted, sessionKey(req.AppName, req.UserID, req.SessionID))
	return nil
}

func (f *fakeSessionService) AppendEvent(ctx context.Context, curSession session.Session, event *session.Event) error {
	if event.Partial {
		return nil
	}
	fs, ok := curSession.(*fakeSession)
	if !ok {
		return fmt.Errorf("unexpected session type %T", curSession)
	}
	sessKey := sessionKey(fs.appName, fs.userID, fs.id)
	f.mu.Lock()
	persisted, ok := f.persisted[sessKey]
	f.mu.Unlock()
	if !ok {
		return cloudflare.ErrSessionNotFound
	}
	for key, value := range event.Actions.StateDelta {
		_ = fs.state.Set(key, value)
		if !strings.HasPrefix(key, session.KeyPrefixTemp) {
			f.mu.Lock()
			persisted[key] = value
			f.mu.Unlock()
		}
	}
	fs.mu.Lock()
	fs.events = append(fs.events, event)
	fs.updated = time.Now()
	fs.mu.Unlock()
	f.mu.Lock()
	f.events[sessKey] = append(f.events[sessKey], event)
	f.mu.Unlock()
	return nil
}

// ---- deterministic ID generator --------------------------------------------

type fakeIDs struct {
	mu sync.Mutex
	n  int
}

func (g *fakeIDs) next(prefix string) string {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.n++
	return fmt.Sprintf("%s-%d", prefix, g.n)
}

func (g *fakeIDs) GenerateRunID() string      { return g.next("run") }
func (g *fakeIDs) GenerateMessageID() string  { return g.next("msg") }
func (g *fakeIDs) GenerateToolCallID() string { return g.next("tool") }
func (g *fakeIDs) GenerateThreadID() string   { return g.next("thread") }
func (g *fakeIDs) GenerateStepID() string     { return g.next("step") }

// ---- fixtures ---------------------------------------------------------------

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "agui", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return data
}

// assertSSEEqual compares the SSE frames in actual against the JSONL golden
// file expected: each is `data: <json>\n\n` in actual, one JSON object per
// line in expected. Comparison is JSON-semantic (not byte-exact) so it is
// insensitive to Go's deterministic-but-incidental map key/whitespace
// choices while still requiring the exact same event vocabulary and fields.
func assertSSEEqual(t *testing.T, actual, expected []byte) {
	t.Helper()
	actualFrames := parseSSEFrames(t, actual)
	expectedFrames := parseJSONLFrames(t, expected)
	if len(actualFrames) != len(expectedFrames) {
		t.Fatalf("frame count = %d, want %d\nactual:\n%s\nwant:\n%s", len(actualFrames), len(expectedFrames), actual, expected)
	}
	for i := range expectedFrames {
		if !reflect.DeepEqual(actualFrames[i], expectedFrames[i]) {
			t.Fatalf("frame %d mismatch:\n got: %#v\nwant: %#v\n\nfull actual:\n%s", i, actualFrames[i], expectedFrames[i], actual)
		}
	}
}

func parseSSEFrames(t *testing.T, data []byte) []any {
	t.Helper()
	var frames []any
	for _, chunk := range bytes.Split(data, []byte("\n\n")) {
		chunk = bytes.TrimSpace(chunk)
		if len(chunk) == 0 {
			continue
		}
		payload, ok := bytes.CutPrefix(chunk, []byte("data: "))
		if !ok {
			t.Fatalf("frame missing data prefix: %s", chunk)
		}
		var value any
		if err := json.Unmarshal(payload, &value); err != nil {
			t.Fatalf("decode frame %s: %v", payload, err)
		}
		frames = append(frames, value)
	}
	return frames
}

func parseJSONLFrames(t *testing.T, data []byte) []any {
	t.Helper()
	var frames []any
	for _, line := range bytes.Split(data, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		var value any
		if err := json.Unmarshal(line, &value); err != nil {
			t.Fatalf("decode fixture line %s: %v", line, err)
		}
		frames = append(frames, value)
	}
	return frames
}
