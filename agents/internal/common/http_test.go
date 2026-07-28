package common

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/baggage"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestNewHTTPClientUsesSafeTracingTransport(t *testing.T) {
	client := NewHTTPClient(time.Second, 1024)
	if _, ok := client.Client.Transport.(*tracingTransport); !ok {
		t.Fatalf("transport = %T", client.Client.Transport)
	}
}

func TestBoundedRedirectsKeepsCredentialsOnlyWithinExactOrigin(t *testing.T) {
	initial, err := http.NewRequest(http.MethodGet, "https://api.example.test/start", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name       string
		target     string
		wantSecret bool
	}{
		{name: "same origin", target: "https://API.example.test:443/next", wantSecret: true},
		{name: "scheme downgrade", target: "http://api.example.test/next"},
		{name: "alternate port", target: "https://api.example.test:8443/next"},
		{name: "different host", target: "https://other.example.test/next"},
	} {
		t.Run(test.name, func(t *testing.T) {
			redirect, err := http.NewRequest(http.MethodGet, test.target, nil)
			if err != nil {
				t.Fatal(err)
			}
			redirect.Header.Set("Authorization", "Bearer provider-secret")
			redirect.Header.Set("X-Subscription-Token", "subscription-secret")
			if err := boundedRedirects(redirect, []*http.Request{initial}); err != nil {
				t.Fatal(err)
			}
			hasAuthorization := redirect.Header.Get("Authorization") != ""
			hasSubscription := redirect.Header.Get("X-Subscription-Token") != ""
			if hasAuthorization != test.wantSecret || hasSubscription != test.wantSecret {
				t.Fatalf("credential headers retained = authorization:%t subscription:%t, want %t", hasAuthorization, hasSubscription, test.wantSecret)
			}
		})
	}
}

func TestTracingTransportPropagatesTraceWithoutSensitiveRequestData(t *testing.T) {
	previousProvider := otel.GetTracerProvider()
	previousPropagator := otel.GetTextMapPropagator()
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	t.Cleanup(func() {
		_ = provider.Shutdown(context.Background())
		otel.SetTracerProvider(previousProvider)
		otel.SetTextMapPropagator(previousPropagator)
	})

	var sent *http.Request
	transport := newTracingTransport(roundTripFunc(func(request *http.Request) (*http.Response, error) {
		sent = request
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader("ok")),
			Request:    request,
		}, nil
	}))
	ctx, parent := otel.Tracer("common-test").Start(t.Context(), "parent")
	member, err := baggage.NewMember("tenant", "baggage-secret")
	if err != nil {
		t.Fatal(err)
	}
	bag, err := baggage.New(member)
	if err != nil {
		t.Fatal(err)
	}
	ctx = baggage.ContextWithBaggage(ctx, bag)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://telemetry.example/botcredential/sendMessage?token=query-secret", strings.NewReader("prompt-secret"))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer provider-secret")
	response, err := transport.RoundTrip(request)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadAll(response.Body); err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}

	if sent == nil || sent.URL.String() != request.URL.String() {
		t.Fatalf("sent URL = %v", sent)
	}
	if sent.Header.Get("Authorization") != "Bearer provider-secret" {
		t.Fatal("authorization behavior changed")
	}
	if sent.Header.Get("traceparent") == "" {
		t.Fatal("trace context was not propagated")
	}
	if sent.Header.Get("baggage") != "" {
		t.Fatalf("baggage crossed external boundary: %q", sent.Header.Get("baggage"))
	}
	spans := recorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("ended spans = %d", len(spans))
	}
	span := spans[0]
	if span.Name() != "HTTP POST" || span.SpanKind() != trace.SpanKindClient {
		t.Fatalf("span = %q kind=%v", span.Name(), span.SpanKind())
	}
	if span.Parent().SpanID() != parent.SpanContext().SpanID() {
		t.Fatal("client span was not attached to its parent")
	}
	attributes := map[string]string{}
	for _, value := range span.Attributes() {
		attributes[string(value.Key)] = value.Value.String()
	}
	if attributes["server.address"] != "telemetry.example" || attributes["http.response.status_code"] != "202" {
		t.Fatalf("attributes = %#v", attributes)
	}
	serialized := span.Name()
	for key, value := range attributes {
		serialized += key + value
	}
	for _, secret := range []string{"botcredential", "query-secret", "prompt-secret", "provider-secret", "baggage-secret"} {
		if strings.Contains(serialized, secret) {
			t.Fatalf("sensitive value %q reached span", secret)
		}
	}
	if _, ok := attributes["url.full"]; ok {
		t.Fatal("full URL reached span")
	}
	parent.End()
}
