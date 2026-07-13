package common

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

var ErrEmptyQuery = errors.New("search query is required")

type SearchResult struct {
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description"`
}
type BraveSearch struct {
	client           *HTTPClient
	endpoint, apiKey string
	maximum          int
}

func NewBraveSearch(client *http.Client, endpoint, apiKey string, maximum int) (*BraveSearch, error) {
	if client == nil {
		client = NewHTTPClient(15*time.Second, defaultMaxBody).Client
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || !secureOrLoopback(parsed) {
		return nil, errors.New("invalid Brave endpoint")
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("missing Brave API key")
	}
	if maximum <= 0 || maximum > 20 {
		maximum = 10
	}
	return &BraveSearch{client: &HTTPClient{Client: client, MaxBody: defaultMaxBody}, endpoint: strings.TrimRight(endpoint, "/"), apiKey: apiKey, maximum: maximum}, nil
}

func (s *BraveSearch) Search(ctx context.Context, query string, count int) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, ErrEmptyQuery
	}
	if len(query) > 500 {
		return nil, errors.New("search query exceeds limit")
	}
	if count < 1 {
		count = 1
	}
	if count > s.maximum {
		count = s.maximum
	}
	parsed, _ := url.Parse(s.endpoint)
	values := parsed.Query()
	values.Set("q", query)
	values.Set("count", strconv.Itoa(count))
	parsed.RawQuery = values.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, errors.New("create Brave request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Subscription-Token", s.apiKey)
	type braveResponse struct {
		Web struct {
			Results []struct{ Title, URL, Description string } `json:"results"`
		} `json:"web"`
	}
	response, err := DecodeJSON[braveResponse](ctx, s.client, request)
	if err != nil {
		return nil, err
	}
	results := make([]SearchResult, 0, min(len(response.Web.Results), count))
	for _, result := range response.Web.Results {
		if len(results) == count {
			break
		}
		parsedURL, err := url.Parse(result.URL)
		if err != nil || parsedURL.Scheme != "https" {
			continue
		}
		results = append(results, SearchResult{Title: result.Title, URL: result.URL, Description: result.Description})
	}
	return results, nil
}

type WebPage struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
}
type WebLoader struct {
	client       *HTTPClient
	resolver     *net.Resolver
	maxText      int
	allowPrivate bool
}

func NewWebLoader(client *HTTPClient, maxText int) *WebLoader {
	if client == nil {
		client = NewHTTPClient(20*time.Second, defaultMaxBody)
	}
	if client.MaxBody <= 0 {
		client.MaxBody = defaultMaxBody
	}
	if maxText <= 0 {
		maxText = 100_000
	}
	return &WebLoader{client: client, resolver: net.DefaultResolver, maxText: maxText}
}

func (l *WebLoader) Load(ctx context.Context, rawURL string) (WebPage, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return WebPage{}, errors.New("invalid HTTPS URL")
	}
	if err := l.validateHost(ctx, parsed.Hostname()); err != nil {
		return WebPage{}, err
	}
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	request.Header.Set("Accept", "text/html,text/plain;q=0.9")
	request.Header.Set("User-Agent", "agents-go/1.0")
	client := *l.client.Client
	baseTransport, ok := baseHTTPTransport(client.Transport)
	if !ok {
		return WebPage{}, errors.New("web loader requires a safe HTTP transport")
	}
	transport := baseTransport.Clone()
	transport.Proxy = nil
	transport.DialContext = l.safeDialContext
	client.Transport = newTracingTransport(transport)
	previous := client.CheckRedirect
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if previous != nil {
			if err := previous(next, via); err != nil {
				return err
			}
		}
		if next.URL.Scheme != "https" {
			return errors.New("insecure redirect blocked")
		}
		return l.validateHost(next.Context(), next.URL.Hostname())
	}
	response, err := client.Do(request)
	if err != nil {
		return WebPage{}, errors.New("web page request failed")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return WebPage{}, errors.New("web page returned an error")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, l.client.MaxBody+1))
	if err != nil || int64(len(data)) > l.client.MaxBody {
		return WebPage{}, errors.New("web page exceeds response limit")
	}
	text, title := extractPageText(data, response.Header.Get("Content-Type"))
	truncated := len(text) > l.maxText
	if truncated {
		text = truncateUTF8(text, l.maxText)
	}
	return WebPage{URL: response.Request.URL.String(), Title: title, Text: strings.TrimSpace(text), Truncated: truncated}, nil
}

func baseHTTPTransport(transport http.RoundTripper) (*http.Transport, bool) {
	if traced, ok := transport.(*tracingTransport); ok {
		transport = traced.base
	}
	base, ok := transport.(*http.Transport)
	return base, ok
}

func (l *WebLoader) validateHost(ctx context.Context, host string) error {
	addresses, err := l.resolver.LookupIPAddr(ctx, host)
	if err != nil || len(addresses) == 0 {
		return errors.New("web host could not be resolved")
	}
	for _, address := range addresses {
		if !l.allowPrivate && unsafeIP(address.IP) {
			return errors.New("private or local web host is blocked")
		}
	}
	return nil
}

func (l *WebLoader) safeDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, errors.New("invalid web address")
	}
	addresses, err := l.resolver.LookupIPAddr(ctx, host)
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("web host could not be resolved")
	}
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	for _, candidate := range addresses {
		if !l.allowPrivate && unsafeIP(candidate.IP) {
			return nil, errors.New("private or local web host is blocked")
		}
		connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(candidate.IP.String(), port))
		if dialErr == nil {
			return connection, nil
		}
	}
	return nil, errors.New("web host connection failed")
}

func unsafeIP(ip net.IP) bool {
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

func secureOrLoopback(parsed *url.URL) bool {
	return parsed.Scheme == "https" || parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1")
}

func extractPageText(data []byte, contentType string) (string, string) {
	if !strings.Contains(strings.ToLower(contentType), "html") {
		return string(data), ""
	}
	document, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return string(data), ""
	}
	var text, title strings.Builder
	var walk func(*html.Node, bool)
	walk = func(node *html.Node, hidden bool) {
		if node.Type == html.ElementNode && (node.Data == "script" || node.Data == "style" || node.Data == "noscript") {
			hidden = true
		}
		if !hidden && node.Type == html.TextNode {
			value := strings.TrimSpace(node.Data)
			if value != "" {
				if node.Parent != nil && node.Parent.Data == "title" {
					title.WriteString(value)
				}
				text.WriteString(value)
				text.WriteByte('\n')
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child, hidden)
		}
	}
	walk(document, false)
	return text.String(), title.String()
}

func truncateUTF8(value string, maximum int) string {
	if len(value) <= maximum {
		return value
	}
	end := maximum
	for end > 0 && value[end]&0xc0 == 0x80 {
		end--
	}
	return value[:end]
}
