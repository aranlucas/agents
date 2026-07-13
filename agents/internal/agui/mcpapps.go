package agui

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

// MCPApps bridges the AG-UI ForwardedRequestHandler boundary to one or more
// MCP Apps servers, matching the shape CopilotKit's runtime uses for its
// mcpApps middleware ("NOT an agent... configured on the runtime directly" —
// packages/runtime/skills/runtime/references/wiring-mcp-apps-middleware.md):
// tool discovery, capability negotiation, and UI-resource resolution live
// here, in the AG-UI layer, so an agent package attaching an *MCPApps as a
// toolset never contains a line of MCP-specific code.
//
// It declares whichever discovered tools are model-visible per the MCP-UI
// _meta.ui.visibility convention, calls them, records the resulting canvas
// activity so activityEvents (converter.go) can turn it into an AG-UI
// ActivitySnapshotEvent, and proxies an embedded UI resource's own
// resources/read and tools/call requests straight through to the owning
// server. None of this fits ADK-Go's mcptoolset (tool/mcptoolset): its
// MCPClient interface only exposes ListTools/CallTool and drops tool Meta on
// conversion, so it can carry neither the capability extension this needs
// nor the visibility/resource metadata that distinguishes a model-callable
// tool from an app-only one.
const (
	mcpAppsUIExtension  = "io.modelcontextprotocol/ui"
	maxMCPResponseBytes = 8 << 20
	maxToolInputBytes   = 512 << 10
)

// MCPAppsServer configures one MCP Apps server, mirroring CopilotKit's
// mcpApps.servers[] entry shape (type/url/serverId).
type MCPAppsServer struct {
	// URL is the MCP server's HTTP(S) endpoint.
	URL string
	// ServerID pins this server's identity in forwarded requests. Required:
	// without a stable ID, a URL change would silently break restoration of
	// MCP Apps activity persisted in prior conversation threads — the same
	// reasoning CopilotKit documents for its own serverId field.
	ServerID string
}

// MCPApps discovers and calls tools across every configured server and
// proxies forwarded MCP Apps requests to whichever server owns them. It
// implements both tool.Toolset and agentruntime.ForwardedRequestHandler.
type MCPApps struct {
	servers map[string]*mcpAppsServerState
}

func NewMCPApps(servers []MCPAppsServer, client *http.Client) (*MCPApps, error) {
	if len(servers) == 0 {
		return nil, errors.New("at least one MCP Apps server is required")
	}
	if client == nil {
		return nil, errors.New("MCP Apps HTTP client is required")
	}
	result := &MCPApps{servers: make(map[string]*mcpAppsServerState, len(servers))}
	for _, cfg := range servers {
		id := strings.TrimSpace(cfg.ServerID)
		if id == "" {
			return nil, errors.New("MCP Apps server ID is required")
		}
		if _, exists := result.servers[id]; exists {
			return nil, fmt.Errorf("duplicate MCP Apps server id %q", id)
		}
		normalized, err := secureMCPEndpoint(cfg.URL)
		if err != nil {
			return nil, err
		}
		copyClient := *client
		base := copyClient.Transport
		if base == nil {
			base = http.DefaultTransport
		}
		copyClient.Transport = &limitedTransport{base: base, maxBytes: maxMCPResponseBytes}
		sum := sha256.Sum256([]byte(normalized))
		result.servers[id] = &mcpAppsServerState{id: id, endpoint: normalized, httpClient: &copyClient, hash: hex.EncodeToString(sum[:16])}
	}
	return result, nil
}

func (m *MCPApps) Name() string { return "mcp_apps" }

// Tools discovers each configured server at most once (lazily, on first
// call) and returns every tool that server marked model-visible. A server
// that fails to connect or list tools contributes no tools rather than
// failing the whole toolset — one unhealthy MCP server must not be fatal to
// an otherwise-unrelated agent run.
func (m *MCPApps) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	var result []tool.Tool
	for _, srv := range m.servers {
		srv.ensureDiscovered(ctx)
		result = append(result, srv.modelTools...)
	}
	return result, nil
}

// mcpAppsServerState holds one server's connection config and discovery
// cache. Discovery (tool list, which names are app-surface tools, which
// ui:// resources they declare) happens at most once per server and is
// shared between Tools and HandleForwarded.
type mcpAppsServerState struct {
	id         string
	endpoint   string
	httpClient *http.Client
	hash       string

	once         sync.Once
	modelTools   []tool.Tool
	appToolNames map[string]bool
	resourceURIs map[string]bool
}

func (s *mcpAppsServerState) ensureDiscovered(ctx context.Context) {
	s.once.Do(func() { s.discover(ctx) })
}

func (s *mcpAppsServerState) discover(ctx context.Context) {
	s.appToolNames = map[string]bool{}
	s.resourceURIs = map[string]bool{}
	session, err := s.connect(ctx)
	if err != nil {
		log.Printf("mcp apps: connect %q: %v", s.id, err)
		return
	}
	defer func() { _ = session.Close() }()
	for definition, listErr := range session.Tools(ctx, nil) {
		if listErr != nil {
			log.Printf("mcp apps: list tools %q: %v", s.id, listErr)
			return
		}
		if definition == nil {
			continue
		}
		// Any tool declaring the ui extension's metadata is part of the app
		// surface and reachable via the forwarded tools/call passthrough,
		// regardless of whether it's also model-visible.
		if ui, ok := decodeUIMetadata(definition.Meta); ok {
			s.appToolNames[definition.Name] = true
			if ui.ResourceURI != "" {
				s.resourceURIs[ui.ResourceURI] = true
			}
		}
		if modelVisible(definition.Meta) {
			s.modelTools = append(s.modelTools, &mcpAppsTool{server: s, definition: definition})
		}
	}
}

func (s *mcpAppsServerState) connect(ctx context.Context) (*mcp.ClientSession, error) {
	capabilities := &mcp.ClientCapabilities{}
	// AddExtension requires map[string]any at the MCP SDK boundary.
	capabilities.AddExtension(mcpAppsUIExtension, map[string]any{"mimeTypes": []string{"text/html;profile=mcp-app"}})
	client := mcp.NewClient(&mcp.Implementation{Name: "agents-go-mcp-apps", Version: "1"}, &mcp.ClientOptions{Capabilities: capabilities})
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: s.endpoint, HTTPClient: s.httpClient, MaxRetries: 1, DisableStandaloneSSE: true}, nil)
	if err != nil {
		return nil, fmt.Errorf("connect to MCP Apps server %q", s.id)
	}
	return session, nil
}

type mcpAppsTool struct {
	server     *mcpAppsServerState
	definition *mcp.Tool
}

func (t *mcpAppsTool) Name() string        { return t.definition.Name }
func (t *mcpAppsTool) Description() string { return t.definition.Description }
func (t *mcpAppsTool) IsLongRunning() bool { return false }
func (t *mcpAppsTool) Declaration() *genai.FunctionDeclaration {
	return &genai.FunctionDeclaration{Name: t.Name(), Description: t.Description(), ParametersJsonSchema: t.definition.InputSchema}
}

func (t *mcpAppsTool) ProcessRequest(ctx agent.Context, req *model.LLMRequest) error {
	if req.Tools == nil {
		req.Tools = make(map[string]any)
	}
	name := t.Name()
	if _, ok := req.Tools[name]; ok {
		return fmt.Errorf("duplicate tool: %q", name)
	}
	req.Tools[name] = t
	if req.Config == nil {
		req.Config = &genai.GenerateContentConfig{}
	}
	decl := t.Declaration()
	if decl == nil {
		return nil
	}
	var funcTool *genai.Tool
	for _, gt := range req.Config.Tools {
		if gt != nil && gt.FunctionDeclarations != nil {
			funcTool = gt
			break
		}
	}
	if funcTool == nil {
		req.Config.Tools = append(req.Config.Tools, &genai.Tool{
			FunctionDeclarations: []*genai.FunctionDeclaration{decl},
		})
	} else {
		funcTool.FunctionDeclarations = append(funcTool.FunctionDeclarations, decl)
	}
	return nil
}

func (t *mcpAppsTool) Run(ctx agent.Context, args any) (map[string]any, error) {
	encoded, err := json.Marshal(args)
	if err != nil || len(encoded) > maxToolInputBytes {
		return nil, errors.New("MCP Apps tool input is invalid or too large")
	}
	if string(encoded) == "null" {
		encoded = []byte("{}")
	}
	if len(encoded) == 0 || encoded[0] != '{' {
		return nil, errors.New("MCP Apps tool input must be an object")
	}
	session, err := t.server.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = session.Close() }()
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: t.Name(), Arguments: json.RawMessage(encoded)})
	if err != nil {
		return nil, errors.New("MCP Apps tool call failed")
	}
	if result.IsError {
		return nil, errors.New("MCP Apps server rejected the tool call")
	}
	if uri := resourceURI(t.definition.Meta); uri != "" {
		content, normalizeErr := activityContent(result, t.server.id, t.server.hash, uri, encoded)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		callID := strings.TrimSpace(ctx.FunctionCallID())
		if callID == "" {
			callID = t.server.id + "-view"
		}
		activity := mcpAppActivity{MessageID: callID, Content: content}
		if err := ctx.State().Set(mcpAppActivityStatePrefix+callID, activity); err != nil {
			return nil, errors.New("record MCP Apps activity")
		}
	}
	return map[string]any{"output": resultText(result)}, nil
}

type activityPayload struct {
	Result      json.RawMessage `json:"result"`
	ResourceURI string          `json:"resourceUri"`
	ServerHash  string          `json:"serverHash"`
	ServerID    string          `json:"serverId"`
	ToolInput   json.RawMessage `json:"toolInput,omitempty"`
}

func activityContent(result *mcp.CallToolResult, serverID, hash, resourceURI string, input json.RawMessage) (json.RawMessage, error) {
	input = bytes.TrimSpace(input)
	if len(input) == 0 || !json.Valid(input) || bytes.Equal(input, []byte("null")) || input[0] != '{' {
		return nil, errors.New("MCP Apps tool input must be a JSON object")
	}
	raw, err := json.Marshal(result)
	if err != nil || len(raw) > maxMCPResponseBytes || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, errors.New("MCP Apps result is invalid or too large")
	}
	content, err := json.Marshal(activityPayload{Result: raw, ResourceURI: resourceURI, ServerHash: hash, ServerID: serverID, ToolInput: input})
	if err != nil || !json.Valid(content) || bytes.Equal(bytes.TrimSpace(content), []byte("null")) {
		return nil, errors.New("MCP Apps activity content is invalid")
	}
	return content, nil
}

func resultText(result *mcp.CallToolResult) string {
	var values []string
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok && strings.TrimSpace(text.Text) != "" {
			values = append(values, text.Text)
		}
	}
	joined := strings.TrimSpace(strings.Join(values, "\n"))
	if len(joined) > 32<<10 {
		joined = joined[:32<<10]
	}
	if joined == "" {
		return "The MCP Apps server updated the interactive canvas."
	}
	return joined
}

type forwardedEnvelope struct {
	Request *proxiedRequest `json:"__proxiedMCPRequest"`
}

type proxiedRequest struct {
	ServerHash string          `json:"serverHash"`
	ServerID   string          `json:"serverId"`
	Method     string          `json:"method"`
	Params     json.RawMessage `json:"params"`
}

// HandleForwarded proxies a request an embedded MCP UI resource issued on
// its own (not a model tool call) to the MCP server that owns it. Server
// identity — id plus a hash of its endpoint — is checked before any
// discovery or network call, so a request naming an unknown or spoofed
// server fails closed immediately.
func (m *MCPApps) HandleForwarded(ctx context.Context, props json.RawMessage) (json.RawMessage, bool, error) {
	raw := bytes.TrimSpace(props)
	if len(raw) == 0 || len(raw) > maxToolInputBytes || !json.Valid(raw) || bytes.Equal(raw, []byte("null")) {
		return nil, false, nil
	}
	var envelope forwardedEnvelope
	if json.Unmarshal(raw, &envelope) != nil || envelope.Request == nil {
		return nil, false, nil
	}
	request := envelope.Request
	srv, ok := m.servers[request.ServerID]
	if !ok || request.ServerHash != srv.hash {
		return nil, true, errors.New("invalid MCP Apps server identity")
	}
	srv.ensureDiscovered(ctx)
	session, err := srv.connect(ctx)
	if err != nil {
		return nil, true, err
	}
	defer func() { _ = session.Close() }()
	switch request.Method {
	case "resources/read":
		var params mcp.ReadResourceParams
		if json.Unmarshal(request.Params, &params) != nil || !srv.resourceURIs[params.URI] {
			return nil, true, errors.New("invalid MCP Apps resource request")
		}
		result, callErr := session.ReadResource(ctx, &params)
		if err := sanitizeMCPError(callErr); err != nil {
			return nil, true, err
		}
		encoded, err := json.Marshal(result)
		encoded = bytes.TrimSpace(encoded)
		if err != nil || len(encoded) == 0 || len(encoded) > maxMCPResponseBytes || !json.Valid(encoded) || bytes.Equal(encoded, []byte("null")) {
			return nil, true, errors.New("MCP Apps response is invalid")
		}
		return encoded, true, nil
	case "tools/call":
		var params mcp.CallToolParams
		if json.Unmarshal(request.Params, &params) != nil || !srv.appToolNames[params.Name] {
			return nil, true, errors.New("invalid MCP Apps app tool request")
		}
		result, callErr := session.CallTool(ctx, &params)
		if err := sanitizeMCPError(callErr); err != nil {
			return nil, true, err
		}
		encoded, err := json.Marshal(result)
		encoded = bytes.TrimSpace(encoded)
		if err != nil || len(encoded) == 0 || len(encoded) > maxMCPResponseBytes || !json.Valid(encoded) || bytes.Equal(encoded, []byte("null")) {
			return nil, true, errors.New("MCP Apps response is invalid")
		}
		return encoded, true, nil
	default:
		return nil, true, errors.New("unsupported MCP Apps method")
	}
}

func sanitizeMCPError(err error) error {
	if err != nil {
		return errors.New("MCP Apps request failed")
	}
	return nil
}

func resourceURI(meta mcp.Meta) string {
	if ui, ok := decodeUIMetadata(meta); ok && ui.ResourceURI != "" {
		return ui.ResourceURI
	}
	value, _ := meta["ui/resourceUri"].(string)
	return value
}

func modelVisible(meta mcp.Meta) bool {
	ui, ok := decodeUIMetadata(meta)
	if !ok {
		return true
	}
	if len(ui.Visibility) == 0 {
		return true
	}
	for _, entry := range ui.Visibility {
		if entry == "model" {
			return true
		}
	}
	return false
}

type uiMetadata struct {
	ResourceURI string   `json:"resourceUri"`
	Visibility  []string `json:"visibility"`
}

func decodeUIMetadata(meta mcp.Meta) (uiMetadata, bool) {
	raw, ok := meta["ui"]
	if !ok {
		return uiMetadata{}, false
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return uiMetadata{}, false
	}
	var ui uiMetadata
	if json.Unmarshal(encoded, &ui) != nil {
		return uiMetadata{}, false
	}
	return ui, true
}

func secureMCPEndpoint(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Hostname() == "" || parsed.User != nil {
		return "", errors.New("invalid MCP Apps endpoint")
	}
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !isLoopback(parsed.Hostname())) {
		return "", errors.New("MCP Apps endpoint must use HTTPS")
	}
	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = "/mcp"
	}
	parsed.RawQuery, parsed.Fragment = "", ""
	return parsed.String(), nil
}

func isLoopback(host string) bool {
	return strings.EqualFold(host, "localhost") || (net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback())
}

type limitedTransport struct {
	base     http.RoundTripper
	maxBytes int64
}

func (t *limitedTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(request)
	if err != nil {
		return nil, err
	}
	response.Body = &limitedReadCloser{Reader: io.LimitReader(response.Body, t.maxBytes+1), closer: response.Body, remaining: t.maxBytes + 1}
	return response, nil
}

type limitedReadCloser struct {
	io.Reader
	closer    io.Closer
	remaining int64
}

func (r *limitedReadCloser) Read(data []byte) (int, error) {
	n, err := r.Reader.Read(data)
	r.remaining -= int64(n)
	if r.remaining <= 0 {
		return n, fmt.Errorf("MCP response exceeds %d bytes", maxMCPResponseBytes)
	}
	return n, err
}
func (r *limitedReadCloser) Close() error { return r.closer.Close() }
