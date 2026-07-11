package mcp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

const (
	ExcalidrawResourceURI = "ui://excalidraw/mcp-app.html"
	activityStatePrefix   = "temp:mcp_app_activity:"
	maxMCPResponseBytes   = 8 << 20
	maxToolInputBytes     = 512 << 10
)

var (
	modelTools = map[string]bool{"read_me": true, "create_view": true}
	appTools   = map[string]bool{
		"read_me": true, "create_view": true, "export_to_excalidraw": true,
		"save_checkpoint": true, "read_checkpoint": true,
	}
)

type Excalidraw struct {
	endpoint    string
	httpClient  *http.Client
	serverHash  string
	once        sync.Once
	tools       []tool.Tool
	discoverErr error
}

func NewExcalidraw(endpoint string, client *http.Client) (*Excalidraw, error) {
	normalized, err := secureMCPEndpoint(endpoint)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, errors.New("Excalidraw MCP HTTP client is required")
	}
	copyClient := *client
	base := copyClient.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	copyClient.Transport = &limitedTransport{base: base, maxBytes: maxMCPResponseBytes}
	sum := sha256.Sum256([]byte(normalized))
	return &Excalidraw{endpoint: normalized, httpClient: &copyClient, serverHash: hex.EncodeToString(sum[:16])}, nil
}

func (e *Excalidraw) Name() string { return "excalidraw_mcp" }

func (e *Excalidraw) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	e.once.Do(func() { e.tools, e.discoverErr = e.discover(ctx) })
	return append([]tool.Tool(nil), e.tools...), e.discoverErr
}

func (e *Excalidraw) discover(ctx context.Context) ([]tool.Tool, error) {
	session, err := e.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = session.Close() }()
	var result []tool.Tool
	for definition, listErr := range session.Tools(ctx, nil) {
		if listErr != nil {
			return nil, errors.New("discover Excalidraw tools")
		}
		if definition != nil && modelTools[definition.Name] && modelVisible(definition.Meta) {
			result = append(result, &remoteTool{bridge: e, definition: definition})
		}
	}
	if len(result) != len(modelTools) {
		return nil, errors.New("Excalidraw MCP did not expose the required model tools")
	}
	return result, nil
}

func (e *Excalidraw) connect(ctx context.Context) (*mcpsdk.ClientSession, error) {
	capabilities := &mcpsdk.ClientCapabilities{}
	// AddExtension requires map[string]any at the MCP SDK boundary.
	capabilities.AddExtension("io.modelcontextprotocol/ui", map[string]any{"mimeTypes": []string{"text/html;profile=mcp-app"}})
	client := mcpsdk.NewClient(&mcpsdk.Implementation{Name: "agents-go-excalidraw", Version: "1"}, &mcpsdk.ClientOptions{Capabilities: capabilities})
	session, err := client.Connect(ctx, &mcpsdk.StreamableClientTransport{Endpoint: e.endpoint, HTTPClient: e.httpClient, MaxRetries: 1, DisableStandaloneSSE: true}, nil)
	if err != nil {
		return nil, errors.New("connect to Excalidraw MCP")
	}
	return session, nil
}

type remoteTool struct {
	bridge     *Excalidraw
	definition *mcpsdk.Tool
}

func (t *remoteTool) Name() string        { return t.definition.Name }
func (t *remoteTool) Description() string { return t.definition.Description }
func (t *remoteTool) IsLongRunning() bool { return false }
func (t *remoteTool) Declaration() *genai.FunctionDeclaration {
	return &genai.FunctionDeclaration{Name: t.Name(), Description: t.Description(), ParametersJsonSchema: t.definition.InputSchema}
}

func (t *remoteTool) ProcessRequest(ctx agent.Context, req *model.LLMRequest) error {
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

func (t *remoteTool) Run(ctx agent.Context, args any) (map[string]any, error) {
	encoded, err := json.Marshal(args)
	if err != nil || len(encoded) > maxToolInputBytes {
		return nil, errors.New("Excalidraw tool input is invalid or too large")
	}
	var input map[string]any
	if err := json.Unmarshal(encoded, &input); err != nil {
		return nil, errors.New("Excalidraw tool input must be an object")
	}
	session, err := t.bridge.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = session.Close() }()
	result, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: t.Name(), Arguments: input})
	if err != nil {
		return nil, errors.New("Excalidraw tool call failed")
	}
	if result.IsError {
		return nil, errors.New("Excalidraw rejected the tool call")
	}
	if resourceURI(t.definition.Meta) != "" {
		content, normalizeErr := activityContent(result, t.bridge.serverHash, input)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		callID := strings.TrimSpace(ctx.FunctionCallID())
		if callID == "" {
			callID = "excalidraw-view"
		}
		activity := struct {
			MessageID string          `json:"messageId"`
			Content   activityPayload `json:"content"`
		}{MessageID: callID, Content: content}
		if err := ctx.State().Set(activityStatePrefix+callID, activity); err != nil {
			return nil, errors.New("record Excalidraw activity")
		}
	}
	return map[string]any{"output": resultText(result)}, nil
}

type activityPayload struct {
	Result      json.RawMessage `json:"result"`
	ResourceURI string          `json:"resourceUri"`
	ServerHash  string          `json:"serverHash"`
	ServerID    string          `json:"serverId"`
	ToolInput   map[string]any  `json:"toolInput,omitempty"`
}

func activityContent(result *mcpsdk.CallToolResult, hash string, input map[string]any) (activityPayload, error) {
	raw, err := json.Marshal(result)
	if err != nil || len(raw) > maxMCPResponseBytes {
		return activityPayload{}, errors.New("Excalidraw result is invalid or too large")
	}
	return activityPayload{Result: raw, ResourceURI: ExcalidrawResourceURI, ServerHash: hash, ServerID: "excalidraw", ToolInput: input}, nil
}

func resultText(result *mcpsdk.CallToolResult) string {
	var values []string
	for _, content := range result.Content {
		if text, ok := content.(*mcpsdk.TextContent); ok && strings.TrimSpace(text.Text) != "" {
			values = append(values, text.Text)
		}
	}
	joined := strings.TrimSpace(strings.Join(values, "\n"))
	if len(joined) > 32<<10 {
		joined = joined[:32<<10]
	}
	if joined == "" {
		return "Excalidraw updated the interactive canvas."
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

func (e *Excalidraw) HandleForwarded(ctx context.Context, props any) (any, bool, error) {
	if props == nil {
		return nil, false, nil
	}
	raw, err := json.Marshal(props)
	if err != nil || len(raw) > maxToolInputBytes {
		return nil, false, nil
	}
	var envelope forwardedEnvelope
	if json.Unmarshal(raw, &envelope) != nil || envelope.Request == nil {
		return nil, false, nil
	}
	request := envelope.Request
	if request.ServerID != "excalidraw" || request.ServerHash != e.serverHash {
		return nil, true, errors.New("invalid Excalidraw MCP server identity")
	}
	session, err := e.connect(ctx)
	if err != nil {
		return nil, true, err
	}
	defer func() { _ = session.Close() }()
	switch request.Method {
	case "resources/read":
		var params mcpsdk.ReadResourceParams
		if json.Unmarshal(request.Params, &params) != nil || params.URI != ExcalidrawResourceURI {
			return nil, true, errors.New("invalid Excalidraw resource request")
		}
		result, callErr := session.ReadResource(ctx, &params)
		return result, true, sanitizeMCPError(callErr)
	case "tools/call":
		var params mcpsdk.CallToolParams
		if json.Unmarshal(request.Params, &params) != nil || !appTools[params.Name] {
			return nil, true, errors.New("invalid Excalidraw app tool request")
		}
		result, callErr := session.CallTool(ctx, &params)
		return result, true, sanitizeMCPError(callErr)
	default:
		return nil, true, errors.New("unsupported Excalidraw MCP method")
	}
}

func sanitizeMCPError(err error) error {
	if err != nil {
		return errors.New("Excalidraw MCP request failed")
	}
	return nil
}

func resourceURI(meta mcpsdk.Meta) string {
	if ui, ok := decodeUIMetadata(meta); ok && ui.ResourceURI != "" {
		return ui.ResourceURI
	}
	value, _ := meta["ui/resourceUri"].(string)
	return value
}

func modelVisible(meta mcpsdk.Meta) bool {
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

func decodeUIMetadata(meta mcpsdk.Meta) (uiMetadata, bool) {
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
		return "", errors.New("invalid Excalidraw MCP endpoint")
	}
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !isLoopback(parsed.Hostname())) {
		return "", errors.New("Excalidraw MCP endpoint must use HTTPS")
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
