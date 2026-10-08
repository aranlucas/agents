package mcpruntime

import (
	"github.com/getsentry/sentry-go"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/adk/v2/agent"
)

// Metadata carries tracing and invocation identity without prompts, tokens,
// user IDs, or session state. Metadata is fresh for every tool call, even when
// a toolset reuses its MCP connection across requests.
func Metadata(ctx agent.Context) (map[string]any, error) {
	meta := map[string]any{"agents/invocation_id": ctx.InvocationID(), "agents/agent": ctx.AgentName()}
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		carrier := propagation.MapCarrier{}
		propagation.TraceContext{}.Inject(ctx, carrier)
		meta["traceparent"] = carrier.Get("traceparent")
	} else if span := sentry.SpanFromContext(ctx); span != nil {
		meta["traceparent"] = span.ToTraceparent()
	}
	return meta, nil
}
