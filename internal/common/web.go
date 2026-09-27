package common

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

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
	client.Transport = transport
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
