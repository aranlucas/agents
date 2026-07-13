package observability

import (
	"context"
	"strings"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const redactedTraceValue = "[redacted]"

// privacyTracerProvider prevents identifiers, credentials, prompts, tool
// payloads, and token usage from reaching the configured trace exporter. ADK
// emits several of these fields from its built-in instrumentation, so the
// filter belongs at the provider boundary rather than at individual call
// sites.
type privacyTracerProvider struct {
	trace.TracerProvider
}

func newPrivacyTracerProvider(provider trace.TracerProvider) trace.TracerProvider {
	return &privacyTracerProvider{TracerProvider: provider}
}

func (p *privacyTracerProvider) Tracer(name string, options ...trace.TracerOption) trace.Tracer {
	return &privacyTracer{Tracer: p.TracerProvider.Tracer(name, options...), provider: p}
}

type privacyTracer struct {
	trace.Tracer
	provider trace.TracerProvider
}

func (t *privacyTracer) Start(ctx context.Context, name string, options ...trace.SpanStartOption) (context.Context, trace.Span) {
	config := trace.NewSpanStartConfig(options...)
	safeOptions := []trace.SpanStartOption{trace.WithSpanKind(config.SpanKind())}
	if !config.Timestamp().IsZero() {
		safeOptions = append(safeOptions, trace.WithTimestamp(config.Timestamp()))
	}
	if config.NewRoot() {
		safeOptions = append(safeOptions, trace.WithNewRoot())
	}
	if attributes := safeTraceAttributes(config.Attributes()); len(attributes) > 0 {
		safeOptions = append(safeOptions, trace.WithAttributes(attributes...))
	}
	if links := config.Links(); len(links) > 0 {
		safeLinks := make([]trace.Link, len(links))
		for i, link := range links {
			safeLinks[i] = trace.Link{SpanContext: link.SpanContext, Attributes: safeTraceAttributes(link.Attributes)}
		}
		safeOptions = append(safeOptions, trace.WithLinks(safeLinks...))
	}
	spanCtx, span := t.Tracer.Start(ctx, name, safeOptions...)
	wrapped := &privacySpan{Span: span, provider: t.provider}
	return trace.ContextWithSpan(spanCtx, wrapped), wrapped
}

type privacySpan struct {
	trace.Span
	provider trace.TracerProvider
}

// AddEvent deliberately omits span events. Event names and exception payloads
// are unstructured and cannot be reliably scrubbed before export.
func (*privacySpan) AddEvent(string, ...trace.EventOption) {}

func (s *privacySpan) AddLink(link trace.Link) {
	link.Attributes = safeTraceAttributes(link.Attributes)
	s.Span.AddLink(link)
}

// RecordError deliberately omits the exception event. Callers can still mark
// the span as failed with SetStatus without exporting provider responses or
// request URLs embedded in an error.
func (*privacySpan) RecordError(error, ...trace.EventOption) {}

func (s *privacySpan) SetStatus(code codes.Code, description string) {
	if code == codes.Error {
		description = "operation failed"
	}
	s.Span.SetStatus(code, description)
}

func (s *privacySpan) SetAttributes(attributes ...attribute.KeyValue) {
	if safe := safeTraceAttributes(attributes); len(safe) > 0 {
		s.Span.SetAttributes(safe...)
	}
}

func (s *privacySpan) TracerProvider() trace.TracerProvider { return s.provider }

func safeTraceAttributes(attributes []attribute.KeyValue) []attribute.KeyValue {
	safe := make([]attribute.KeyValue, 0, len(attributes))
	for _, value := range attributes {
		if sensitiveTraceKey(string(value.Key)) {
			safe = append(safe, value.Key.String(redactedTraceValue))
			continue
		}
		safe = append(safe, value)
	}
	return safe
}

func sensitiveTraceKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	for _, fragment := range []string{
		"authorization",
		"api_key",
		"apikey",
		"chat.id",
		"chat_id",
		"content",
		"conversation.id",
		"credential",
		"password",
		"prompt",
		"secret",
		"session.id",
		"session_id",
		"token",
		"tool_call_args",
		"tool_response",
		"url.full",
		"url.query",
		"user.id",
		"user_id",
	} {
		if strings.Contains(key, fragment) {
			return true
		}
	}
	return false
}
