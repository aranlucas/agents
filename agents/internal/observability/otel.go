// Package observability configures the process-wide OpenTelemetry provider and
// instruments HTTP handlers. Each command must call Setup at most once and
// invoke the returned Shutdown function during graceful shutdown.
package observability

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.41.0"
)

// Config identifies one process in exported telemetry.
type Config struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
}

// Shutdown flushes pending spans and releases exporter resources.
type Shutdown func(context.Context) error

// Setup initializes the official OTLP/HTTP trace exporter from standard OTEL
// environment variables. With no endpoint, or when OTEL_SDK_DISABLED=true, it
// deliberately installs nothing and returns a no-op shutdown function.
func Setup(ctx context.Context, cfg Config) (Shutdown, error) {
	if strings.TrimSpace(cfg.ServiceName) == "" {
		return nil, errors.New("OpenTelemetry service name is required")
	}
	disabled, err := strconv.ParseBool(orDefault(os.Getenv("OTEL_SDK_DISABLED"), "false"))
	if err != nil {
		return nil, errors.New("OTEL_SDK_DISABLED must be a boolean")
	}
	tracesEndpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))
	sharedEndpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if disabled || (tracesEndpoint == "" && sharedEndpoint == "") {
		return func(context.Context) error { return nil }, nil
	}
	protocol := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL"))
	if protocol == "" {
		protocol = strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL"))
	}
	if protocol != "" && protocol != "http/protobuf" {
		return nil, fmt.Errorf("unsupported OTLP trace protocol %q; use http/protobuf", protocol)
	}
	sampler, err := samplerFromEnv()
	if err != nil {
		return nil, err
	}

	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("configure OTLP trace exporter: %w", err)
	}
	attributes := []resource.Option{
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
		resource.WithProcess(),
		resource.WithOS(),
		resource.WithContainer(),
		resource.WithHost(),
		resource.WithAttributes(
			semconv.ServiceName(strings.TrimSpace(cfg.ServiceName)),
			semconv.DeploymentEnvironmentNameKey.String(strings.TrimSpace(cfg.Environment)),
		),
	}
	if version := strings.TrimSpace(cfg.ServiceVersion); version != "" {
		attributes = append(attributes, resource.WithAttributes(semconv.ServiceVersion(version)))
	}
	res, err := resource.New(ctx, attributes...)
	if err != nil {
		_ = exporter.Shutdown(ctx)
		return nil, fmt.Errorf("configure OpenTelemetry resource: %w", err)
	}
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)
	otel.SetTracerProvider(newPrivacyTracerProvider(provider))
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	return provider.Shutdown, nil
}

func samplerFromEnv() (sdktrace.Sampler, error) {
	name := strings.ToLower(orDefault(os.Getenv("OTEL_TRACES_SAMPLER"), "parentbased_always_on"))
	switch name {
	case "always_on":
		return sdktrace.AlwaysSample(), nil
	case "always_off":
		return sdktrace.NeverSample(), nil
	case "traceidratio":
		ratio, err := samplerRatio()
		if err != nil {
			return nil, err
		}
		return sdktrace.TraceIDRatioBased(ratio), nil
	case "parentbased_always_on":
		return sdktrace.ParentBased(sdktrace.AlwaysSample()), nil
	case "parentbased_always_off":
		return sdktrace.ParentBased(sdktrace.NeverSample()), nil
	case "parentbased_traceidratio":
		ratio, err := samplerRatio()
		if err != nil {
			return nil, err
		}
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio)), nil
	default:
		return nil, fmt.Errorf("unsupported OTEL_TRACES_SAMPLER %q", name)
	}
}

func samplerRatio() (float64, error) {
	value := strings.TrimSpace(os.Getenv("OTEL_TRACES_SAMPLER_ARG"))
	ratio, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > 1 {
		return 0, errors.New("OTEL_TRACES_SAMPLER_ARG must be a number from 0 to 1")
	}
	return ratio, nil
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

// Wrap instruments next with an HTTP server span named after operation.
func Wrap(operation string, next http.Handler) http.Handler {
	return otelhttp.NewHandler(next, operation, otelhttp.WithSpanNameFormatter(func(string, *http.Request) string {
		return operation
	}))
}
