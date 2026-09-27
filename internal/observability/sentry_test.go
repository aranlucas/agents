package observability

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

type captureTransport struct{ events []*sentry.Event }

func (*captureTransport) Configure(sentry.ClientOptions)        {}
func (*captureTransport) Flush(time.Duration) bool              { return true }
func (*captureTransport) FlushWithContext(context.Context) bool { return true }
func (t *captureTransport) SendEvent(event *sentry.Event)       { t.events = append(t.events, event) }
func (*captureTransport) Close()                                {}

func TestSetupSentryRequiresServiceName(t *testing.T) {
	if _, err := SetupSentry(Config{}); err == nil {
		t.Fatal("expected error for empty service name")
	}
}

func TestSetupSentryWithoutDSNIsNoop(t *testing.T) {
	flush, err := SetupSentry(Config{ServiceName: "agents-test", Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	flush()
}

func TestSetupSentryRejectsInvalidDSN(t *testing.T) {
	if _, err := SetupSentry(Config{ServiceName: "agents-test", Environment: "test", DSN: "not-a-dsn"}); err == nil {
		t.Fatal("expected error for invalid DSN")
	}
}

func TestWrapSentryRepanicsAndServesNormally(t *testing.T) {
	served := false
	handler := WrapSentry(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		served = true
		w.WriteHeader(http.StatusNoContent)
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if !served || rec.Code != http.StatusNoContent {
		t.Fatalf("served = %v, code = %d", served, rec.Code)
	}

	panicking := WrapSentry(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	defer func() {
		if recover() == nil {
			t.Fatal("expected panic to propagate through WrapSentry")
		}
	}()
	panicking.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))
}

func TestCaptureErrorIgnoresNilAndExplicitCancellation(t *testing.T) {
	// Without an initialized client these must all be safe no-ops.
	CaptureError(context.Background(), nil)
	CaptureError(context.Background(), context.Canceled)
	CaptureError(context.Background(), context.DeadlineExceeded, ErrorDetails{
		Operation: "agent.run",
		Tags:      map[string]string{"agent": "oralboards"},
		Context:   map[string]any{"run_id": "run-1"},
	})
	CaptureError(context.Background(), errors.New("reported"))
}

func TestCaptureErrorRecordsDeadlineAndOperationalDetails(t *testing.T) {
	transport := &captureTransport{}
	client, err := sentry.NewClient(sentry.ClientOptions{
		Dsn:              "https://public@example.com/1",
		Transport:        transport,
		EnableTracing:    true,
		TracesSampleRate: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	hub := sentry.NewHub(client, sentry.NewScope())
	ctx := sentry.SetHubOnContext(context.Background(), hub)
	span := sentry.StartTransaction(ctx, "agent.run")
	defer span.Finish()
	ctx = span.Context()

	CaptureError(ctx, context.DeadlineExceeded, ErrorDetails{
		Operation:   "agent.run",
		Tags:        map[string]string{"agent.route": "oralboards"},
		Context:     map[string]any{"run_id": "run-1"},
		Fingerprint: []string{"agent.run", "oralboards", "timeout"},
	})
	CaptureError(ctx, context.Canceled)

	if len(transport.events) != 1 {
		t.Fatalf("captured events = %d, want 1", len(transport.events))
	}
	event := transport.events[0]
	if event.Tags["operation"] != "agent.run" || event.Tags["agent.route"] != "oralboards" {
		t.Fatalf("captured tags = %#v", event.Tags)
	}
	if event.Contexts["operation"]["run_id"] != "run-1" {
		t.Fatalf("captured context = %#v", event.Contexts)
	}
	if event.Contexts["trace"]["trace_id"] != span.TraceID {
		t.Fatalf("captured trace context = %#v", event.Contexts["trace"])
	}
	if want := []string{"agent.run", "oralboards", "timeout"}; !slices.Equal(event.Fingerprint, want) {
		t.Fatalf("captured fingerprint = %#v, want %#v", event.Fingerprint, want)
	}
}
