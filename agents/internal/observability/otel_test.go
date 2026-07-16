package observability

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func TestSetupExportsAndFlushesTrace(t *testing.T) {
	requests := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/traces" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Content-Type"); got != "application/x-protobuf" {
			t.Errorf("content type = %q", got)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		requests <- body
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("OTEL_SDK_DISABLED", "false")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", server.URL)
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", "")
	t.Setenv("OTEL_TRACES_SAMPLER", "parentbased_always_on")
	t.Setenv("OTEL_TRACES_SAMPLER_ARG", "")

	shutdown, err := Setup(t.Context(), Config{ServiceName: "agents-test", ServiceVersion: "1.2.3", Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	_, span := otel.Tracer("agents-test").Start(t.Context(), "probe")
	span.SetAttributes(
		attribute.String("safe.operation", "probe"),
		attribute.String("gen_ai.conversation.id", "chat-id-secret"),
		attribute.String("gcp.vertex.agent.tool_response", "credential-secret"),
		attribute.Int("gen_ai.usage.input_tokens", 123),
	)
	span.RecordError(errors.New("provider-secret"))
	span.SetStatus(codes.Error, "prompt-secret")
	span.End()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	select {
	case body := <-requests:
		if len(body) == 0 {
			t.Fatal("empty OTLP export")
		}
		for _, secret := range [][]byte{[]byte("chat-id-secret"), []byte("credential-secret"), []byte("provider-secret"), []byte("prompt-secret")} {
			if bytes.Contains(body, secret) {
				t.Fatalf("sensitive value %q reached OTLP exporter", secret)
			}
		}
		if !bytes.Contains(body, []byte("safe.operation")) || !bytes.Contains(body, []byte(redactedTraceValue)) {
			t.Fatal("safe or redacted trace attributes missing from OTLP export")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("OTLP trace was not exported")
	}
}

func TestSamplerFromEnvSupportsStandardTraceSamplers(t *testing.T) {
	for _, testCase := range []struct {
		name, sampler, argument string
		wantErr                 bool
	}{
		{name: "always on", sampler: "always_on"},
		{name: "always off", sampler: "always_off"},
		{name: "ratio", sampler: "traceidratio", argument: "0.25"},
		{name: "parent always on", sampler: "parentbased_always_on"},
		{name: "parent always off", sampler: "parentbased_always_off"},
		{name: "parent ratio", sampler: "parentbased_traceidratio", argument: "0.5"},
		{name: "unknown", sampler: "custom", wantErr: true},
		{name: "missing ratio", sampler: "traceidratio", wantErr: true},
		{name: "invalid ratio", sampler: "traceidratio", argument: "NaN", wantErr: true},
		{name: "large ratio", sampler: "parentbased_traceidratio", argument: "2", wantErr: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv("OTEL_TRACES_SAMPLER", testCase.sampler)
			t.Setenv("OTEL_TRACES_SAMPLER_ARG", testCase.argument)
			_, err := samplerFromEnv()
			if (err != nil) != testCase.wantErr {
				t.Fatalf("samplerFromEnv() error = %v, wantErr %t", err, testCase.wantErr)
			}
		})
	}
}

func TestSetupCanBeDisabledOrLeftUnconfigured(t *testing.T) {
	for name, disabled := range map[string]string{
		"disabled":    "true",
		"no endpoint": "false",
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("OTEL_SDK_DISABLED", disabled)
			t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
			t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
			shutdown, err := Setup(t.Context(), Config{ServiceName: "agents-test", Environment: "test"})
			if err != nil {
				t.Fatal(err)
			}
			if err := shutdown(t.Context()); err != nil {
				t.Fatalf("Shutdown() error = %v", err)
			}
		})
	}
}

func TestSetupRejectsUnsafeConfiguration(t *testing.T) {
	for _, testCase := range []struct {
		name, service, disabled, protocol, want string
	}{
		{name: "missing service", disabled: "false", want: "service name"},
		{name: "invalid disabled", service: "agents", disabled: "sometimes", want: "boolean"},
		{name: "unsupported protocol", service: "agents", disabled: "false", protocol: "grpc", want: "http/protobuf"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv("OTEL_SDK_DISABLED", testCase.disabled)
			t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otel.example.com")
			t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", testCase.protocol)
			_, err := Setup(t.Context(), Config{ServiceName: testCase.service, Environment: "test"})
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("Setup() error = %v", err)
			}
		})
	}
}

func TestWrapExtractsParentAndServesRequestsUnchanged(t *testing.T) {
	previousProvider := otel.GetTracerProvider()
	previousPropagator := otel.GetTextMapPropagator()
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() {
		_ = provider.Shutdown(context.Background())
		otel.SetTracerProvider(previousProvider)
		otel.SetTextMapPropagator(previousPropagator)
	})

	inner := http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if !trace.SpanContextFromContext(request.Context()).IsValid() {
			t.Error("handler did not receive an extracted span context")
		}
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("ok"))
	})
	wrapped := Wrap("test-gateway", inner)

	req := httptest.NewRequest(http.MethodGet, "/probe?prompt=secret", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if rr.Code != http.StatusTeapot {
		t.Fatalf("status = %d", rr.Code)
	}
	if rr.Body.String() != "ok" {
		t.Fatalf("body = %q", rr.Body.String())
	}
	spans := recorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("ended spans = %d", len(spans))
	}
	if spans[0].Name() != "test-gateway" || spans[0].SpanKind() != trace.SpanKindServer {
		t.Fatalf("span = %q kind=%v", spans[0].Name(), spans[0].SpanKind())
	}
	if got := spans[0].Parent().SpanID().String(); got != "00f067aa0ba902b7" {
		t.Fatalf("parent span ID = %q", got)
	}
	for _, value := range spans[0].Attributes() {
		if strings.Contains(value.Value.String(), "secret") {
			t.Fatalf("query value reached server span: %v", value)
		}
	}
}

func TestWrapPreservesIncrementalSSEFlushing(t *testing.T) {
	release := make(chan struct{})
	released := false
	defer func() {
		if !released {
			close(release)
		}
	}()

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprint(w, "data: first\n\n")
		flusher.Flush()
		<-release
		_, _ = fmt.Fprint(w, "data: second\n\n")
		flusher.Flush()
	})

	server := httptest.NewServer(Wrap("test-sse", inner))
	defer server.Close()
	response, err := http.Get(server.URL) //nolint:gosec // local test server
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("status=%d content-type=%q", response.StatusCode, response.Header.Get("Content-Type"))
	}

	reader := bufio.NewReader(response.Body)
	if line, err := reader.ReadString('\n'); err != nil || line != "data: first\n" {
		t.Fatalf("first streamed line=%q err=%v", line, err)
	}
	if line, err := reader.ReadString('\n'); err != nil || line != "\n" {
		t.Fatalf("first frame terminator=%q err=%v", line, err)
	}

	close(release)
	released = true
	if line, err := reader.ReadString('\n'); err != nil || line != "data: second\n" {
		t.Fatalf("second streamed line=%q err=%v", line, err)
	}
}
