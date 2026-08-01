package observability

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetupSentryRequiresServiceName(t *testing.T) {
	if _, err := SetupSentry(Config{}); err == nil {
		t.Fatal("expected error for empty service name")
	}
}

func TestSetupSentryWithoutDSNIsNoop(t *testing.T) {
	t.Setenv("SENTRY_DSN", "")
	flush, err := SetupSentry(Config{ServiceName: "agents-test", Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	flush()
}

func TestSetupSentryRejectsInvalidDSN(t *testing.T) {
	t.Setenv("SENTRY_DSN", "not-a-dsn")
	if _, err := SetupSentry(Config{ServiceName: "agents-test", Environment: "test"}); err == nil {
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

func TestCaptureErrorIgnoresNilAndCancellation(t *testing.T) {
	// Without an initialized client these must all be safe no-ops.
	CaptureError(context.Background(), nil)
	CaptureError(context.Background(), context.Canceled)
	CaptureError(context.Background(), context.DeadlineExceeded)
	CaptureError(context.Background(), errors.New("reported"))
}
