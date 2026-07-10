// Package observability wires OpenTelemetry HTTP tracing for the gateway.
//
// This intentionally stops at instrumentation, not exporter configuration:
// Wrap attaches otelhttp spans using whichever global TracerProvider and
// TextMapPropagator are registered (the OTEL SDK default is a no-op tracer,
// so Wrap is a safe, always-on default even when no collector is
// configured). Registering a real exporter (e.g. via
// OTEL_EXPORTER_OTLP_ENDPOINT, mirroring the Python gateway's setup_otel in
// agents/gateway/src/gateway/main.go) is deployment configuration and out
// of scope for this package — see AGENTS.md's note that Dockerfiles/CI are
// a separate task. When that wiring lands, it only needs to call
// otel.SetTracerProvider before Wrap is invoked; this package does not need
// to change.
package observability

import (
	"net/http"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Wrap instruments next with OTEL HTTP server spans, one per request, named
// after the given operation. It never blocks and never fails: with no
// TracerProvider configured, spans are recorded by a no-op tracer and carry
// no cost beyond the wrapping call.
func Wrap(operation string, next http.Handler) http.Handler {
	return otelhttp.NewHandler(next, operation)
}
