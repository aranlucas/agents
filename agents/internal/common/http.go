package common

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.41.0"
	"go.opentelemetry.io/otel/trace"
)

const defaultMaxBody = 2 << 20

type HTTPClient struct {
	Client  *http.Client
	MaxBody int64
}

func NewHTTPClient(timeout time.Duration, maxBody int64) *HTTPClient {
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	if maxBody <= 0 {
		maxBody = defaultMaxBody
	}
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext, ForceAttemptHTTP2: true, MaxIdleConns: 32, MaxIdleConnsPerHost: 8, IdleConnTimeout: 60 * time.Second, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: timeout}
	client := &http.Client{Transport: newTracingTransport(transport), Timeout: timeout, CheckRedirect: boundedRedirects}
	return &HTTPClient{Client: client, MaxBody: maxBody}
}

type tracingTransport struct {
	base http.RoundTripper
}

func newTracingTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &tracingTransport{base: base}
}

func (t *tracingTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	method := safeHTTPMethod(request.Method)
	attributes := []attribute.KeyValue{semconv.HTTPRequestMethodKey.String(method)}
	if request.URL != nil {
		if scheme := strings.ToLower(request.URL.Scheme); scheme == "http" || scheme == "https" {
			attributes = append(attributes, semconv.URLScheme(scheme))
		}
		if host := request.URL.Hostname(); host != "" {
			attributes = append(attributes, semconv.ServerAddress(host))
		}
		if port, err := strconv.Atoi(request.URL.Port()); err == nil && port > 0 {
			attributes = append(attributes, semconv.ServerPort(port))
		}
	}
	ctx, span := otel.Tracer("agents/internal/common").Start(
		request.Context(),
		"HTTP "+method,
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(attributes...),
	)
	traced := request.Clone(ctx)
	if traced.Header == nil {
		traced.Header = make(http.Header)
	}
	propagation.TraceContext{}.Inject(ctx, propagation.HeaderCarrier(traced.Header))
	response, err := t.base.RoundTrip(traced)
	if err != nil {
		span.SetAttributes(semconv.ErrorTypeOther)
		span.SetStatus(codes.Error, "HTTP request failed")
		span.End()
		return response, err
	}
	span.SetAttributes(semconv.HTTPResponseStatusCode(response.StatusCode))
	if response.StatusCode >= http.StatusBadRequest {
		span.SetStatus(codes.Error, "HTTP request failed")
	}
	if response.Body == nil {
		span.End()
		return response, nil
	}
	response.Body = &tracingResponseBody{ReadCloser: response.Body, span: span}
	return response, nil
}

func safeHTTPMethod(method string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	switch method {
	case http.MethodConnect, http.MethodDelete, http.MethodGet, http.MethodHead,
		http.MethodOptions, http.MethodPatch, http.MethodPost, http.MethodPut,
		http.MethodTrace:
		return method
	default:
		return "_OTHER"
	}
}

type tracingResponseBody struct {
	io.ReadCloser
	span trace.Span
	once sync.Once
}

func (b *tracingResponseBody) Read(data []byte) (int, error) {
	n, err := b.ReadCloser.Read(data)
	switch err {
	case nil:
	case io.EOF:
		b.end()
	default:
		b.span.SetAttributes(semconv.ErrorTypeOther)
		b.span.SetStatus(codes.Error, "HTTP response read failed")
		b.end()
	}
	return n, err
}

func (b *tracingResponseBody) Close() error {
	err := b.ReadCloser.Close()
	if err != nil {
		b.span.SetAttributes(semconv.ErrorTypeOther)
		b.span.SetStatus(codes.Error, "HTTP response close failed")
	}
	b.end()
	return err
}

func (b *tracingResponseBody) end() { b.once.Do(func() { b.span.End() }) }

func boundedRedirects(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("redirect limit reached")
	}
	if len(via) > 0 && !SameOrigin(via[0].URL, request.URL) {
		request.Header.Del("Authorization")
		request.Header.Del("X-Subscription-Token")
	}
	return nil
}

// SameOrigin reports whether two HTTP URLs have the same scheme, hostname, and
// effective port. Credential-bearing redirects must use the full origin rather
// than hostname alone so HTTPS downgrades and alternate ports fail closed.
func SameOrigin(left, right *url.URL) bool {
	if left == nil || right == nil {
		return false
	}
	scheme := strings.ToLower(left.Scheme)
	if (scheme != "http" && scheme != "https") || !strings.EqualFold(scheme, right.Scheme) {
		return false
	}
	return strings.EqualFold(left.Hostname(), right.Hostname()) && effectivePort(left) == effectivePort(right)
}

func effectivePort(target *url.URL) string {
	if port := target.Port(); port != "" {
		return port
	}
	if strings.EqualFold(target.Scheme, "http") {
		return "80"
	}
	if strings.EqualFold(target.Scheme, "https") {
		return "443"
	}
	return ""
}

func DecodeJSON[T any](ctx context.Context, client *HTTPClient, request *http.Request) (T, error) {
	var zero T
	if client == nil || client.Client == nil || request == nil {
		return zero, errors.New("HTTP client and request are required")
	}
	request = request.Clone(ctx)
	response, err := client.Client.Do(request)
	if err != nil {
		return zero, errors.New("external HTTP request failed")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return zero, errors.New("external HTTP service returned an error")
	}
	reader := io.LimitReader(response.Body, client.MaxBody+1)
	data, err := io.ReadAll(reader)
	if err != nil || int64(len(data)) > client.MaxBody {
		return zero, errors.New("external HTTP response exceeds limit")
	}
	var result T
	if json.Unmarshal(data, &result) != nil {
		return zero, errors.New("external HTTP response is invalid")
	}
	return result, nil
}
