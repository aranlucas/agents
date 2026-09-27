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

	"github.com/aranlucas/agents/internal/common"
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
	client         *http.Client
	endpoint       string
	nativeShopping bool
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

// withNativeShopping returns a per-agent capability view without mutating the
// shared Kroger client used to construct the chat and wellness task agents.
func (k *Kroger) withNativeShopping(enabled bool) *Kroger {
	if k == nil {
		return nil
	}
	clone := *k
	clone.nativeShopping = enabled
	return &clone
}

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
	client.Transport = &bearerTransport{base: base, token: token, origin: parsed}
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
	if !k.nativeShopping {
		return tools, nil
	}
	filtered := make([]tool.Tool, 0, len(tools))
	for _, candidate := range tools {
		if candidate != nil && nativeShoppingKrogerTool(candidate.Name()) {
			filtered = append(filtered, candidate)
		}
	}
	return filtered, nil
}

func nativeShoppingKrogerTool(name string) bool {
	switch name {
	case "search_products", "get_product", "search_stores", "get_store", "shop_for_items",
		"create_shopping_list", "add_shopping_list_to_cart", "view_cart", "get_weekly_deals":
		return true
	default:
		return false
	}
}

type bearerTransport struct {
	base   http.RoundTripper
	token  string
	origin *url.URL
}

func (t *bearerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	clone.Header = request.Header.Clone()
	if common.SameOrigin(t.origin, clone.URL) {
		clone.Header.Set("Authorization", "Bearer "+t.token)
	} else {
		// net/http removes Authorization on cross-host redirects, but this
		// transport previously reattached it. Strip it for every origin change,
		// including scheme downgrades and alternate ports.
		clone.Header.Del("Authorization")
	}
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
