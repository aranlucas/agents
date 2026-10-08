package travel

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/aranlucas/agents/internal/mcpruntime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"golang.org/x/sync/semaphore"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/mcptoolset"
)

const (
	trvlDiscoveryTimeout = 15 * time.Second
	trvlDiscoveryTTL     = 5 * time.Minute
)

type cachedToolset struct {
	inner   TRVLToolset
	mu      *semaphore.Weighted
	tools   []tool.Tool
	expires time.Time
	closed  bool
}

// TRVLToolset owns a shared travel MCP connection. Close it at process shutdown.
type TRVLToolset interface {
	tool.Toolset
	io.Closer
}

// NewTRVL uses ADK-Go's official MCP adapter and the official MCP Go SDK.
// Discovery is deadline-bound and cached; tool calls are bounded by the
// supplied HTTP client's timeout.
func NewTRVL(endpoint string, client *http.Client) TRVLToolset {
	if err := validateTRVLEndpoint(endpoint); err != nil {
		return &invalidTRVLToolset{err: err}
	}
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	inner, err := mcptoolset.New(mcptoolset.Config{MetadataProvider: mcpruntime.Metadata, Transport: &mcp.StreamableClientTransport{
		Endpoint:             endpoint,
		HTTPClient:           client,
		MaxRetries:           2,
		DisableStandaloneSSE: true,
	}})
	if err != nil {
		return &invalidTRVLToolset{err: err}
	}
	owned, ok := inner.(TRVLToolset)
	if !ok {
		return &invalidTRVLToolset{err: errors.New("travel MCP toolset does not support cleanup")}
	}
	return &cachedToolset{inner: owned, mu: semaphore.NewWeighted(1)}
}

func (c *cachedToolset) Name() string { return "trvl_mcp" }

func (c *cachedToolset) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	deadline, cancel := context.WithTimeout(ctx, trvlDiscoveryTimeout)
	defer cancel()
	if err := c.mu.Acquire(deadline, 1); err != nil {
		return nil, err
	}
	defer c.mu.Release(1)
	if c.closed {
		return nil, mcp.ErrConnectionClosed
	}
	if len(c.tools) > 0 && time.Now().Before(c.expires) {
		return append([]tool.Tool(nil), c.tools...), nil
	}
	tools, err := c.inner.Tools(readonlyDeadlineContext{ReadonlyContext: ctx, Context: deadline})
	if err != nil {
		return nil, err
	}
	c.tools, c.expires = tools, time.Now().Add(trvlDiscoveryTTL)
	return append([]tool.Tool(nil), c.tools...), nil
}

func (c *cachedToolset) Close() error {
	if err := c.mu.Acquire(context.Background(), 1); err != nil {
		return err
	}
	defer c.mu.Release(1)
	if c.closed {
		return nil
	}
	c.closed = true
	c.tools = nil
	return c.inner.Close()
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

func (*invalidTRVLToolset) Close() error { return nil }

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
