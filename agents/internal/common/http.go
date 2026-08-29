package common

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultMaxBody = 2 << 20

type HTTPClient struct {
	Client  *http.Client
	MaxBody int64
}

// WriteJSON writes one JSON response with a consistent content type and status.
// Any returned error means the response could not be fully delivered; callers
// should log it because the HTTP status may already be committed.
func WriteJSON(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.MarshalWrite(w, value)
}

func NewHTTPClient(timeout time.Duration, maxBody int64) *HTTPClient {
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	if maxBody <= 0 {
		maxBody = defaultMaxBody
	}
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext, ForceAttemptHTTP2: true, MaxIdleConns: 32, MaxIdleConnsPerHost: 8, IdleConnTimeout: 60 * time.Second, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: timeout}
	client := &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: boundedRedirects}
	return &HTTPClient{Client: client, MaxBody: maxBody}
}

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

func (client *HTTPClient) DecodeJSON[T any](ctx context.Context, request *http.Request) (T, error) {
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
