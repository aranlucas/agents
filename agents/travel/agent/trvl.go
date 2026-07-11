package travel

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/mcptoolset"
	"google.golang.org/genai"
)

const (
	trvlDiscoveryTimeout = 15 * time.Second
	trvlDiscoveryTTL     = 5 * time.Minute
)

type cachedToolset struct {
	inner   tool.Toolset
	mu      sync.Mutex
	tools   []tool.Tool
	expires time.Time
}

// NewTRVL uses ADK-Go's official MCP adapter and the official MCP Go SDK.
// Discovery is deadline-bound and cached; tool calls are bounded by the
// supplied HTTP client's timeout.
func NewTRVL(endpoint string, client *http.Client) tool.Toolset {
	if err := validateTRVLEndpoint(endpoint); err != nil {
		return &invalidTRVLToolset{err: err}
	}
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	inner, err := mcptoolset.New(mcptoolset.Config{Transport: &mcp.StreamableClientTransport{
		Endpoint:             endpoint,
		HTTPClient:           client,
		MaxRetries:           2,
		DisableStandaloneSSE: true,
	}})
	if err != nil {
		return &invalidTRVLToolset{err: err}
	}
	return &cachedToolset{inner: inner}
}

func (c *cachedToolset) Name() string { return "trvl_mcp" }

func (c *cachedToolset) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.tools) > 0 && time.Now().Before(c.expires) {
		return append([]tool.Tool(nil), c.tools...), nil
	}
	deadline, cancel := context.WithTimeout(ctx, trvlDiscoveryTimeout)
	defer cancel()
	tools, err := c.inner.Tools(readonlyDeadlineContext{ReadonlyContext: ctx, Context: deadline})
	if err != nil {
		return nil, err
	}
	c.tools, c.expires = guardConsequentialTools(tools), time.Now().Add(trvlDiscoveryTTL)
	return append([]tool.Tool(nil), c.tools...), nil
}

type executableTool interface {
	tool.Tool
	Declaration() *genai.FunctionDeclaration
	ProcessRequest(agent.Context, *model.LLMRequest) error
	Run(agent.Context, any) (map[string]any, error)
}

type approvalGuardTool struct{ executableTool }

func (t *approvalGuardTool) Run(ctx agent.Context, args any) (map[string]any, error) {
	if !approvedForTravelTool(ctx.UserContent(), t.Name()) {
		return nil, errors.New("matching explicit travel approval is required")
	}
	return t.executableTool.Run(ctx, args)
}

func guardConsequentialTools(tools []tool.Tool) []tool.Tool {
	result := append([]tool.Tool(nil), tools...)
	for index, candidate := range result {
		if !isConsequentialTravelTool(candidate.Name()) {
			continue
		}
		if executable, ok := candidate.(executableTool); ok {
			result[index] = &approvalGuardTool{executableTool: executable}
		}
	}
	return result
}

func isConsequentialTravelTool(name string) bool {
	switch name {
	case "mark_trip_booked", "book_flight", "book_hotel", "reserve_hotel", "share_itinerary", "charge_card", "confirm_booking", "purchase_ticket":
		return true
	default:
		return false
	}
}

func approvedForTravelTool(content *genai.Content, toolName string) bool {
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

type readonlyDeadlineContext struct {
	agent.ReadonlyContext
	context.Context
}

func (c readonlyDeadlineContext) Deadline() (time.Time, bool) { return c.Context.Deadline() }
func (c readonlyDeadlineContext) Done() <-chan struct{}       { return c.Context.Done() }
func (c readonlyDeadlineContext) Err() error                  { return c.Context.Err() }
func (c readonlyDeadlineContext) Value(key any) any           { return c.Context.Value(key) }

type invalidTRVLToolset struct{ err error }

func (*invalidTRVLToolset) Name() string { return "trvl_mcp" }
func (i *invalidTRVLToolset) Tools(agent.ReadonlyContext) ([]tool.Tool, error) {
	return nil, i.err
}

func validateTRVLEndpoint(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return errors.New("invalid TRVL MCP endpoint")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	host := parsed.Hostname()
	if parsed.Scheme == "http" && (host == "localhost" || net.ParseIP(host).IsLoopback()) {
		return nil
	}
	return errors.New("TRVL MCP endpoint must use HTTPS (HTTP is allowed only on loopback)")
}
