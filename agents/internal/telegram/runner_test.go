package telegram

import (
	"context"
	"sync"
	"testing"
	"time"
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
	if runner.HasTask("telegram:1:orchestrator") {
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
	if client.sent[0].Text != EscapeMarkdownV2("Working with travel…") || client.sent[1].Text != EscapeMarkdownV2("Final answer") {
		t.Fatalf("sent=%#v", client.sent)
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
	if runner.HasTask("telegram:2:orchestrator") {
		t.Fatal("task retained")
	}
}
