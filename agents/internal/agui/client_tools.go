// Package agui implements the AG-UI protocol boundary for ADK-Go.
package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/aranlucas/agents/agents/internal/auth"
	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/agent"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
	"google.golang.org/genai"
)

const (
	pendingToolTTL    = 15 * time.Minute
	maximumToolArgs   = 256 << 10
	maximumToolResult = 1 << 20
	maximumToolSchema = 64 << 10
)

var (
	ErrPendingToolNotFound = errors.New("pending client tool not found")
	clientToolName         = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$`)
)

// ClientTool is a frontend function declaration supplied with an AG-UI run.
type ClientTool struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters,omitempty"`
}

// ToolScope is the complete authorization boundary for one pending call.
type ToolScope struct{ AppName, UserID, ThreadID string }

// PendingTools persists frontend calls until a scoped result resumes them.
type PendingTools interface {
	Register(context.Context, ToolScope, string, string, map[string]any) error
	Resolve(context.Context, auth.Identity, string, string, string, any) error
	Take(context.Context, auth.Identity, string, string, string) (*genai.FunctionResponse, error)
}

// PendingStore is a D1-backed single-consumption pending call store.
type PendingStore struct {
	d1  *cloudflare.D1
	now func() time.Time
}

func NewPendingStore(d1 *cloudflare.D1, now func() time.Time) *PendingStore {
	if now == nil {
		now = time.Now
	}
	return &PendingStore{d1: d1, now: now}
}

func (p *PendingStore) Register(ctx context.Context, scope ToolScope, callID, toolName string, args map[string]any) error {
	if p == nil || p.d1 == nil {
		return errors.New("D1 pending tool store is required")
	}
	if !validScope(scope) || !clientToolName.MatchString(callID) || !clientToolName.MatchString(toolName) {
		return errors.New("invalid pending tool identity")
	}
	encoded, err := json.Marshal(args)
	if err != nil || len(encoded) > maximumToolArgs {
		return errors.New("invalid client tool arguments")
	}
	now := p.now().UTC()
	_, err = p.d1.Run(ctx,
		cloudflare.Statement{SQL: "DELETE FROM pending_client_tools WHERE expires_at <= ?", Params: []any{now.UnixMilli()}},
		cloudflare.Statement{SQL: `INSERT INTO pending_client_tools
			(app_name, user_id, thread_id, call_id, tool_name, args_json, status, created_at, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`, Params: []any{scope.AppName, scope.UserID, scope.ThreadID, callID, toolName, string(encoded), now.UnixMilli(), now.Add(pendingToolTTL).UnixMilli()}},
	)
	if err != nil {
		return fmt.Errorf("register pending client tool: %w", err)
	}
	return nil
}

func (p *PendingStore) Resolve(ctx context.Context, identity auth.Identity, app, thread, callID string, result any) error {
	if p == nil || p.d1 == nil {
		return errors.New("D1 pending tool store is required")
	}
	if identity.Public || !validScope(ToolScope{AppName: app, UserID: identity.UserID, ThreadID: thread}) || !clientToolName.MatchString(callID) {
		return ErrPendingToolNotFound
	}
	encoded, err := json.Marshal(result)
	if err != nil || len(encoded) > maximumToolResult {
		return errors.New("invalid client tool result")
	}
	now := p.now().UTC()
	results, err := p.d1.Run(ctx,
		cloudflare.Statement{SQL: "DELETE FROM pending_client_tools WHERE expires_at <= ?", Params: []any{now.UnixMilli()}},
		cloudflare.Statement{SQL: `UPDATE pending_client_tools SET result_json = ?, status = 'resolved'
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'pending' AND expires_at > ?`,
			Params: []any{string(encoded), app, identity.UserID, thread, callID, now.UnixMilli()}},
	)
	if err != nil {
		return fmt.Errorf("resolve pending client tool: %w", err)
	}
	if len(results) < 2 || results[1].Meta.Changes != 1 {
		return ErrPendingToolNotFound
	}
	return nil
}

func (p *PendingStore) Take(ctx context.Context, identity auth.Identity, app, thread, callID string) (*genai.FunctionResponse, error) {
	if p == nil || p.d1 == nil || identity.Public || !validScope(ToolScope{AppName: app, UserID: identity.UserID, ThreadID: thread}) || !clientToolName.MatchString(callID) {
		return nil, ErrPendingToolNotFound
	}
	now := p.now().UTC()
	results, err := p.d1.Run(ctx,
		cloudflare.Statement{SQL: `SELECT tool_name, result_json FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'resolved' AND expires_at > ?`, Params: []any{app, identity.UserID, thread, callID, now.UnixMilli()}},
		cloudflare.Statement{SQL: `DELETE FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'resolved' AND expires_at > ?`, Params: []any{app, identity.UserID, thread, callID, now.UnixMilli()}},
	)
	if err != nil {
		return nil, fmt.Errorf("consume pending client tool: %w", err)
	}
	if len(results) < 2 || len(results[0].Rows) != 1 || results[1].Meta.Changes != 1 {
		return nil, ErrPendingToolNotFound
	}
	row := results[0].Rows[0]
	toolName, _ := row["tool_name"].(string)
	encoded, _ := row["result_json"].(string)
	if toolName == "" || encoded == "" {
		return nil, errors.New("invalid pending client tool record")
	}
	var raw any
	if json.Unmarshal([]byte(encoded), &raw) != nil {
		return nil, errors.New("invalid pending client tool result")
	}
	response, ok := raw.(map[string]any)
	if !ok {
		response = map[string]any{"result": raw}
	}
	return &genai.FunctionResponse{ID: callID, Name: toolName, Response: response}, nil
}

// ClientToolset exposes request-provided frontend tools as long-running ADK tools.
type ClientToolset struct {
	tools   []tool.Tool
	pending PendingTools
}

func NewClientToolset(input []ClientTool, pending PendingTools) (tool.Toolset, error) {
	if pending == nil {
		return nil, errors.New("pending client tool store is required")
	}
	toolset := &ClientToolset{pending: pending}
	seen := make(map[string]bool)
	for _, definition := range input {
		if !clientToolName.MatchString(definition.Name) || seen[definition.Name] {
			return nil, fmt.Errorf("invalid or duplicate client tool %q", definition.Name)
		}
		seen[definition.Name] = true
		schema, err := clientSchema(definition.Parameters)
		if err != nil {
			return nil, fmt.Errorf("client tool %q schema: %w", definition.Name, err)
		}
		name := definition.Name
		wrapped, err := functiontool.New[map[string]any, map[string]any](functiontool.Config{Name: name, Description: definition.Description, InputSchema: schema, IsLongRunning: true}, func(ctx tool.Context, args map[string]any) (map[string]any, error) {
			scope := ToolScope{AppName: ctx.AppName(), UserID: ctx.UserID(), ThreadID: ctx.SessionID()}
			if err := pending.Register(ctx, scope, ctx.FunctionCallID(), name, args); err != nil {
				return nil, err
			}
			return map[string]any{"status": "pending", "call_id": ctx.FunctionCallID()}, nil
		})
		if err != nil {
			return nil, err
		}
		toolset.tools = append(toolset.tools, wrapped)
	}
	return toolset, nil
}

func (c *ClientToolset) Name() string { return "agui_client_tools" }
func (c *ClientToolset) Tools(agent.ReadonlyContext) ([]tool.Tool, error) {
	return append([]tool.Tool(nil), c.tools...), nil
}

func clientSchema(value any) (*jsonschema.Schema, error) {
	if value == nil {
		return &jsonschema.Schema{Type: "object", Properties: map[string]*jsonschema.Schema{}}, nil
	}
	encoded, err := json.Marshal(value)
	if err != nil || len(encoded) > maximumToolSchema {
		return nil, errors.New("invalid or oversized JSON schema")
	}
	var schema jsonschema.Schema
	if json.Unmarshal(encoded, &schema) != nil {
		return nil, errors.New("invalid JSON schema")
	}
	if schema.Type != "" && schema.Type != "object" {
		return nil, errors.New("client tool parameters must be an object")
	}
	return &schema, nil
}

func validScope(scope ToolScope) bool {
	for _, value := range []string{scope.AppName, scope.UserID, scope.ThreadID} {
		if strings.TrimSpace(value) == "" || len(value) > 256 || strings.ContainsAny(value, "\x00\r\n") {
			return false
		}
	}
	return true
}
