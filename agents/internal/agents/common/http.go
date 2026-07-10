package common

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
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
	client := &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: boundedRedirects}
	return &HTTPClient{Client: client, MaxBody: maxBody}
}

func boundedRedirects(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("redirect limit reached")
	}
	if len(via) > 0 && !sameOrigin(via[0].URL.Hostname(), request.URL.Hostname()) {
		request.Header.Del("Authorization")
		request.Header.Del("X-Subscription-Token")
	}
	return nil
}

func sameOrigin(left, right string) bool { return strings.EqualFold(left, right) }

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
