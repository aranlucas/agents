package grocery

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/mcptoolset"
)

type krogerTokenKey struct{}

func WithKrogerToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, krogerTokenKey{}, strings.TrimSpace(token))
}

func KrogerToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(krogerTokenKey{}).(string)
	return token, ok && token != ""
}

type Kroger struct {
	client   *http.Client
	endpoint string
}

func NewKroger(client *http.Client, endpoint string) *Kroger {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if parsed, err := url.Parse(endpoint); err == nil && (parsed.Path == "" || parsed.Path == "/") {
		parsed.Path = "/mcp"
		endpoint = parsed.String()
	}
	return &Kroger{client: client, endpoint: endpoint}
}

func (*Kroger) Name() string { return "kroger_mcp" }

func (k *Kroger) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	if k == nil || ctx == nil || ctx.ReadonlyState() == nil {
		return nil, nil
	}
	raw, err := ctx.ReadonlyState().Get(session.KeyPrefixTemp + "kroger_token")
	token, ok := raw.(string)
	if err != nil || !ok || strings.TrimSpace(token) == "" {
		return nil, nil
	}
	parsed, err := url.Parse(k.endpoint)
	if err != nil || parsed.Host == "" || !secureKrogerEndpoint(parsed) {
		return nil, errors.New("invalid Kroger MCP endpoint")
	}
	client := *k.client
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client.Transport = &bearerTransport{base: base, token: token}
	inner, err := mcptoolset.New(mcptoolset.Config{Transport: &mcp.StreamableClientTransport{Endpoint: parsed.String(), HTTPClient: &client, MaxRetries: 2, DisableStandaloneSSE: true}})
	if err != nil {
		return nil, err
	}
	deadline, cancel := context.WithTimeout(WithKrogerToken(ctx, token), 15*time.Second)
	defer cancel()
	tools, err := inner.Tools(krogerReadonlyContext{ReadonlyContext: ctx, Context: deadline})
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{
		"search_products": true,
		"get_product":     true,
		"search_stores":   true,
		"get_store":       true,
		// set_preferred_store is native when a shopping repository is present.
		// Exposing the MCP copy as well would make ADK reject the request with
		// duplicate tool: the static and dynamic toolsets share this name.
		"shop_for_items":            true,
		"create_shopping_list":      true,
		"add_shopping_list_to_cart": true,
		"view_cart":                 true,
		"get_weekly_deals":          true,
	}
	filtered := make([]tool.Tool, 0, len(tools))
	for _, candidate := range tools {
		if candidate != nil && allowed[candidate.Name()] {
			filtered = append(filtered, candidate)
		}
	}
	return filtered, nil
}

type bearerTransport struct {
	base  http.RoundTripper
	token string
}

func (t *bearerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	clone.Header = request.Header.Clone()
	clone.Header.Set("Authorization", "Bearer "+t.token)
	response, err := t.base.RoundTrip(clone)
	if err != nil {
		return nil, err
	}
	response.Body = &boundedBody{Reader: io.LimitReader(response.Body, (8<<20)+1), Closer: response.Body}
	return response, nil
}

type boundedBody struct {
	io.Reader
	io.Closer
}

type krogerReadonlyContext struct {
	agent.ReadonlyContext
	context.Context
}

func (c krogerReadonlyContext) Deadline() (time.Time, bool) { return c.Context.Deadline() }
func (c krogerReadonlyContext) Done() <-chan struct{}       { return c.Context.Done() }
func (c krogerReadonlyContext) Err() error                  { return c.Context.Err() }
func (c krogerReadonlyContext) Value(key any) any           { return c.Context.Value(key) }

func secureKrogerEndpoint(parsed *url.URL) bool {
	if parsed.Scheme == "https" {
		return true
	}
	ip := net.ParseIP(parsed.Hostname())
	return parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || ip != nil && ip.IsLoopback())
}
