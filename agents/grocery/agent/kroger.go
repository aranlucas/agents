package grocery

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/mcptoolset"
	"google.golang.org/genai"
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
	return guardKrogerTools(tools), nil
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

type executableTool interface {
	tool.Tool
	Declaration() *genai.FunctionDeclaration
	ProcessRequest(agent.Context, *model.LLMRequest) error
	Run(agent.Context, any) (map[string]any, error)
}

type groceryGuardTool struct{ executableTool }

func (t *groceryGuardTool) Run(ctx agent.Context, args any) (map[string]any, error) {
	if t.Name() == "checkout_shopping_list" && !approvedForGroceryTool(ctx.UserContent(), t.Name()) {
		return nil, errors.New("matching explicit checkout approval is required")
	}
	if t.Name() == "add_to_cart" && !approvedForGroceryTool(ctx.UserContent(), t.Name()) && !directCartRequest(ctx.UserContent()) {
		return nil, errors.New("direct cart request or matching approval is required")
	}
	return t.executableTool.Run(ctx, args)
}

func guardKrogerTools(tools []tool.Tool) []tool.Tool {
	result := append([]tool.Tool(nil), tools...)
	for index, candidate := range result {
		if candidate.Name() != "add_to_cart" && candidate.Name() != "checkout_shopping_list" {
			continue
		}
		if executable, ok := candidate.(executableTool); ok {
			result[index] = &groceryGuardTool{executableTool: executable}
		}
	}
	return result
}

func approvedForGroceryTool(content *genai.Content, toolName string) bool {
	if content == nil {
		return false
	}
	for _, part := range content.Parts {
		response := part.FunctionResponse
		if response == nil || response.Name != "request_user_approval" {
			continue
		}
		var approval struct {
			Approved bool `json:"approved"`
			Request  struct {
				Action string `json:"action"`
			} `json:"_agui_request"`
		}
		encoded, err := json.Marshal(response.Response)
		if err == nil && json.Unmarshal(encoded, &approval) == nil && approval.Approved && approval.Request.Action == toolName {
			return true
		}
	}
	return false
}

func directCartRequest(content *genai.Content) bool {
	if content == nil {
		return false
	}
	for _, part := range content.Parts {
		text := strings.TrimSpace(strings.ToLower(part.Text))
		direct := strings.HasPrefix(text, "add ") || strings.HasPrefix(text, "please add ") || strings.HasPrefix(text, "put ") || strings.HasPrefix(text, "please put ")
		if direct && strings.Contains(text, "cart") {
			return true
		}
	}
	return false
}

func secureKrogerEndpoint(parsed *url.URL) bool {
	if parsed.Scheme == "https" {
		return true
	}
	ip := net.ParseIP(parsed.Hostname())
	return parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || ip != nil && ip.IsLoopback())
}
