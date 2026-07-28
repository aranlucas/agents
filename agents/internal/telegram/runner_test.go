package telegram

import (
	"context"
	"errors"
	"iter"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type fakeClient struct {
	mu   sync.Mutex
	sent []SendMessageRequest
}

func (*fakeClient) GetUpdates(context.Context, int64, int) ([]Update, error) { return nil, nil }
func (c *fakeClient) SendMessage(_ context.Context, input SendMessageRequest) (Message, error) {
	c.mu.Lock()
	c.sent = append(c.sent, input)
	c.mu.Unlock()
	return Message{}, nil
}
func (*fakeClient) SendChatAction(context.Context, int64, int64, string) error { return nil }

type scriptedPollingClient struct {
	mu         sync.Mutex
	updates    []Update
	failures   map[int64]int
	offsets    []int64
	attempts   []int64
	delivered  []int64
	completeAt int64
	completed  chan struct{}
	once       sync.Once
}

func newScriptedPollingClient(updates []Update, failures map[int64]int, completeAt int64) *scriptedPollingClient {
	return &scriptedPollingClient{
		updates:    updates,
		failures:   failures,
		completeAt: completeAt,
		completed:  make(chan struct{}),
	}
}

func (c *scriptedPollingClient) GetUpdates(ctx context.Context, offset int64, _ int) ([]Update, error) {
	c.mu.Lock()
	c.offsets = append(c.offsets, offset)
	if offset >= c.completeAt {
		c.once.Do(func() { close(c.completed) })
		c.mu.Unlock()
		<-ctx.Done()
		return nil, ctx.Err()
	}
	updates := make([]Update, 0, len(c.updates))
	for _, update := range c.updates {
		if update.UpdateID >= offset {
			updates = append(updates, update)
		}
	}
	c.mu.Unlock()
	return updates, nil
}

func (c *scriptedPollingClient) SendMessage(_ context.Context, input SendMessageRequest) (Message, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.attempts = append(c.attempts, input.ChatID)
	if c.failures[input.ChatID] > 0 {
		c.failures[input.ChatID]--
		return Message{}, errors.New("temporary Telegram send failure")
	}
	c.delivered = append(c.delivered, input.ChatID)
	return Message{}, nil
}

func (*scriptedPollingClient) SendChatAction(context.Context, int64, int64, string) error {
	return nil
}

func (c *scriptedPollingClient) snapshot() (offsets, attempts, delivered []int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return slices.Clone(c.offsets), slices.Clone(c.attempts), slices.Clone(c.delivered)
}

type fakeExecutor struct {
	started  chan struct{}
	block    bool
	output   string
	progress []string
}

func (e *fakeExecutor) Run(ctx context.Context, _ SessionIdentity, _ Route, _ string, progress ProgressFunc) (string, error) {
	if e.started != nil {
		select {
		case <-e.started:
		default:
			close(e.started)
		}
	}
	for _, item := range e.progress {
		_ = progress(ctx, item)
	}
	if e.block {
		<-ctx.Done()
		return "", ctx.Err()
	}
	return e.output, nil
}
func (*fakeExecutor) Reset(context.Context, SessionIdentity) error { return nil }

func newTestRunner(t *testing.T, executor *fakeExecutor) (*Runner, *fakeClient) {
	t.Helper()
	client := &fakeClient{}
	links := newLinkStore(newMemoryLinkDB(), time.Now)
	runner, err := NewRunner(client, NewRouter(Config{}, nil), links, executor, Config{}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	return runner, client
}

func privateMessage(chatID int64, text string) Message {
	return Message{Chat: Chat{ID: chatID, Type: "private"}, From: &User{ID: chatID}, Text: text}
}

func TestRunRetriesFailedUpdateBeforeAdvancingOffset(t *testing.T) {
	message := privateMessage(1, "/help")
	client := newScriptedPollingClient(
		[]Update{{UpdateID: 41, Message: &message}},
		map[int64]int{message.Chat.ID: 1},
		42,
	)
	runner := newPollingTestRunner(t, client)
	runPollingTest(t, runner, client.completed)

	offsets, attempts, delivered := client.snapshot()
	if !slices.Equal(offsets, []int64{0, 41, 42}) {
		t.Fatalf("poll offsets = %v, want [0 41 42]", offsets)
	}
	if !slices.Equal(attempts, []int64{1, 1}) || !slices.Equal(delivered, []int64{1}) {
		t.Fatalf("send attempts = %v delivered = %v", attempts, delivered)
	}
	if runner.offset != 42 {
		t.Fatalf("final offset = %d, want 42", runner.offset)
	}
}

func TestRunKeepsLaterUpdateBehindFailedUpdate(t *testing.T) {
	first := privateMessage(1, "/help")
	later := privateMessage(2, "/help")
	client := newScriptedPollingClient(
		[]Update{{UpdateID: 10, Message: &first}, {UpdateID: 11, Message: &later}},
		map[int64]int{first.Chat.ID: 1},
		12,
	)
	runner := newPollingTestRunner(t, client)
	runPollingTest(t, runner, client.completed)

	offsets, attempts, delivered := client.snapshot()
	if !slices.Equal(offsets, []int64{0, 10, 12}) {
		t.Fatalf("poll offsets = %v, want [0 10 12]", offsets)
	}
	if !slices.Equal(attempts, []int64{1, 1, 2}) {
		t.Fatalf("send attempts = %v, want failed update retried before later update", attempts)
	}
	if !slices.Equal(delivered, []int64{1, 2}) {
		t.Fatalf("delivery order = %v, want [1 2]", delivered)
	}
}

func newPollingTestRunner(t *testing.T, client Client) *Runner {
	t.Helper()
	links := newLinkStore(newMemoryLinkDB(), time.Now)
	runner, err := NewRunner(client, NewRouter(Config{}, nil), links, &fakeExecutor{}, Config{}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	runner.retryDelay = 0
	return runner
}

func runPollingTest(t *testing.T, runner *Runner, completed <-chan struct{}) {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()
	select {
	case <-completed:
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("runner did not reach the completed offset")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runner did not stop after cancellation")
	}
}

func TestStopCancelsOnlyCurrentSessionTask(t *testing.T) {
	executor := &fakeExecutor{started: make(chan struct{}), block: true}
	runner, _ := newTestRunner(t, executor)
	done := make(chan error, 1)
	go func() { done <- runner.HandleMessage(context.Background(), privateMessage(1, "hello")) }()
	select {
	case <-executor.started:
	case <-time.After(time.Second):
		t.Fatal("task did not start")
	}
	if err := runner.HandleMessage(context.Background(), privateMessage(1, "/stop")); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("task was not cancelled")
	}
	if runner.tasks.Has("telegram:1:orchestrator") {
		t.Fatal("cancelled task retained")
	}
}

func TestRunnerSendsProgressThenDeduplicatedFinalText(t *testing.T) {
	executor := &fakeExecutor{output: "Final answer", progress: []string{"Working with travel…", "Working with travel…"}}
	runner, client := newTestRunner(t, executor)
	if err := runner.HandleMessage(t.Context(), privateMessage(1, "plan a trip")); err != nil {
		t.Fatal(err)
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	if len(client.sent) != 2 {
		t.Fatalf("sent=%#v", client.sent)
	}
	if client.sent[0].Text != ChunkMarkdownV2("Working with travel…", 4096)[0] || client.sent[1].Text != ChunkMarkdownV2("Final answer", 4096)[0] {
		t.Fatalf("sent=%#v", client.sent)
	}
}

func TestHandleMessageCreatesSafeProcessingSpan(t *testing.T) {
	recorder := installTelegramSpanRecorder(t)
	executor := &fakeExecutor{output: "response-secret"}
	runner, _ := newTestRunner(t, executor)
	message := privateMessage(987654321, "prompt-secret")
	if err := runner.HandleMessage(t.Context(), message); err != nil {
		t.Fatal(err)
	}
	span := findEndedSpan(t, recorder, "telegram.message.process")
	if span.SpanKind() != trace.SpanKindConsumer {
		t.Fatalf("span kind = %v", span.SpanKind())
	}
	attributes := spanAttributeStrings(span)
	if attributes["messaging.system"] != "telegram" || attributes["messaging.operation.type"] != "process" || attributes["telegram.chat.type"] != "private" || attributes["gen_ai.agent.name"] != "orchestrator" {
		t.Fatalf("attributes = %#v", attributes)
	}
	assertSpanExcludes(t, span, "prompt-secret", "response-secret", "987654321")
	for _, key := range []string{"user.id", "user_id", "chat.id", "chat_id", "message.text"} {
		if _, ok := attributes[key]; ok {
			t.Fatalf("sensitive attribute %q recorded", key)
		}
	}
}

func TestBusySessionDoesNotLeakTaskEntries(t *testing.T) {
	executor := &fakeExecutor{started: make(chan struct{}), block: true}
	runner, _ := newTestRunner(t, executor)
	done := make(chan error, 1)
	go func() { done <- runner.HandleMessage(context.Background(), privateMessage(2, "hello")) }()
	<-executor.started
	if err := runner.HandleMessage(t.Context(), privateMessage(2, "another")); err != nil {
		t.Fatal(err)
	}
	_ = runner.HandleMessage(t.Context(), privateMessage(2, "/stop"))
	<-done
	if runner.tasks.Has("telegram:2:orchestrator") {
		t.Fatal("task retained")
	}
}

func TestNewADKExecutorBindsOfficialRunnersOnce(t *testing.T) {
	built, err := agent.New(agent.Config{Name: "orchestrator"})
	if err != nil {
		t.Fatal(err)
	}
	executor, err := NewADKExecutor(session.InMemoryService(), nil, map[string]agent.Agent{"orchestrator": built})
	if err != nil {
		t.Fatal(err)
	}
	bound := executor.agents["orchestrator"]
	if bound.agent != built || bound.runner == nil {
		t.Fatalf("bound agent = %#v", bound)
	}
}

func TestNewADKExecutorRejectsInvalidAgentTreeAtConstruction(t *testing.T) {
	first, _ := agent.New(agent.Config{Name: "duplicate"})
	second, _ := agent.New(agent.Config{Name: "duplicate"})
	root, _ := agent.New(agent.Config{Name: "orchestrator", SubAgents: []agent.Agent{first, second}})
	if _, err := NewADKExecutor(session.InMemoryService(), nil, map[string]agent.Agent{"orchestrator": root}); err == nil {
		t.Fatal("expected duplicate agent name to fail during executor construction")
	}
}

func TestADKExecutorCreatesSafeRunSpan(t *testing.T) {
	recorder := installTelegramSpanRecorder(t)
	built, err := agent.New(agent.Config{
		Name: "orchestrator",
		Run: func(agent.InvocationContext) iter.Seq2[*session.Event, error] {
			return func(yield func(*session.Event, error) bool) {
				yield(&session.Event{
					LLMResponse: model.LLMResponse{Content: genai.NewContentFromText("response-secret", genai.RoleModel)},
					Author:      "orchestrator",
				}, nil)
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	executor, err := NewADKExecutor(session.InMemoryService(), nil, map[string]agent.Agent{"orchestrator": built})
	if err != nil {
		t.Fatal(err)
	}
	identity := SessionIdentity{SessionID: "chat-id-secret", UserID: "user-id-secret", ClerkUserID: "credential-secret", Shared: true}
	route := Route{Kind: RouteAgent, Agent: "orchestrator", Text: "prompt-secret", KrogerToken: "kroger-secret"}
	output, err := executor.Run(t.Context(), identity, route, route.Text, func(context.Context, string) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if output != "response-secret" {
		t.Fatalf("output = %q", output)
	}
	span := findEndedSpan(t, recorder, "telegram.adk.run")
	if span.SpanKind() != trace.SpanKindInternal {
		t.Fatalf("span kind = %v", span.SpanKind())
	}
	attributes := spanAttributeStrings(span)
	if attributes["gen_ai.operation.name"] != "invoke_agent" || attributes["gen_ai.agent.name"] != "orchestrator" || attributes["telegram.session.shared"] != "true" {
		t.Fatalf("attributes = %#v", attributes)
	}
	assertSpanExcludes(t, span, "prompt-secret", "response-secret", "chat-id-secret", "user-id-secret", "credential-secret", "kroger-secret")
}

func installTelegramSpanRecorder(t *testing.T) *tracetest.SpanRecorder {
	t.Helper()
	previous := otel.GetTracerProvider()
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	otel.SetTracerProvider(provider)
	t.Cleanup(func() {
		_ = provider.Shutdown(context.Background())
		otel.SetTracerProvider(previous)
	})
	return recorder
}

func findEndedSpan(t *testing.T, recorder *tracetest.SpanRecorder, name string) sdktrace.ReadOnlySpan {
	t.Helper()
	for _, span := range recorder.Ended() {
		if span.Name() == name {
			return span
		}
	}
	t.Fatalf("span %q not found in %d ended spans", name, len(recorder.Ended()))
	return nil
}

func spanAttributeStrings(span sdktrace.ReadOnlySpan) map[string]string {
	attributes := make(map[string]string, len(span.Attributes()))
	for _, value := range span.Attributes() {
		attributes[string(value.Key)] = value.Value.String()
	}
	return attributes
}

func assertSpanExcludes(t *testing.T, span sdktrace.ReadOnlySpan, values ...string) {
	t.Helper()
	serialized := span.Name() + span.Status().Description
	for key, value := range spanAttributeStrings(span) {
		serialized += key + value
	}
	for _, value := range values {
		if strings.Contains(serialized, value) {
			t.Fatalf("sensitive value %q reached span", value)
		}
	}
}
