package observability

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
)

// sentryFlushTimeout bounds how long process shutdown waits for buffered
// events to reach Sentry before giving up.
const sentryFlushTimeout = 2 * time.Second

// SetupSentry initializes the process-wide Sentry client from SENTRY_DSN.
// With no DSN it deliberately installs nothing and returns a no-op flush,
// mirroring how Setup treats a missing OTLP endpoint. The returned flush
// must run during graceful shutdown so buffered events are delivered.
func SetupSentry(cfg Config) (func(), error) {
	if strings.TrimSpace(cfg.ServiceName) == "" {
		return nil, errors.New("Sentry service name is required")
	}
	dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN"))
	if dsn == "" {
		return func() {}, nil
	}
	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      strings.TrimSpace(cfg.Environment),
		Release:          strings.TrimSpace(cfg.ServiceVersion),
		ServerName:       strings.TrimSpace(cfg.ServiceName),
		AttachStacktrace: true,
	})
	if err != nil {
		return nil, fmt.Errorf("configure Sentry: %w", err)
	}
	return func() { sentry.Flush(sentryFlushTimeout) }, nil
}

// WrapSentry reports handler panics to Sentry and re-panics so net/http's
// existing per-connection recovery and logging stay unchanged. It also binds
// a request-scoped hub into the context for CaptureError. Without a
// configured client every captured event is discarded, so wrapping is safe
// even when SetupSentry installed nothing.
func WrapSentry(next http.Handler) http.Handler {
	return sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle(next)
}

// CaptureError reports err to Sentry unless it is nil or only a context
// cancellation. It prefers the request-scoped hub bound by WrapSentry and is
// safe to call before SetupSentry or without a DSN.
func CaptureError(ctx context.Context, err error) {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return
	}
	hub := sentry.GetHubFromContext(ctx)
	if hub == nil {
		hub = sentry.CurrentHub()
	}
	hub.CaptureException(err)
}
