package cloudflare

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"agents/internal/agui"
	"agents/internal/auth"
	"google.golang.org/genai"
)

const (
	pendingToolTTL    = 15 * time.Minute
	maximumToolArgs   = 256 << 10
	maximumToolResult = 1 << 20
)

// PendingStore is a D1-backed single-consumption implementation of
// agui.PendingTools.
type PendingStore struct {
	d1  *D1
	now func() time.Time
}

func NewPendingStore(d1 *D1, now func() time.Time) *PendingStore {
	if now == nil {
		now = time.Now
	}
	return &PendingStore{d1: d1, now: now}
}

var _ agui.PendingTools = (*PendingStore)(nil)

func (p *PendingStore) Register(ctx context.Context, scope agui.ToolScope, callID, toolName string, args map[string]any) error {
	if p == nil || p.d1 == nil {
		return errors.New("D1 pending tool store is required")
	}
	if !validScope(scope) || !agui.ClientCallID.MatchString(callID) || !agui.ClientToolName.MatchString(toolName) {
		return errors.New("invalid pending tool identity")
	}
	encoded, err := json.Marshal(args)
	if err != nil || len(encoded) > maximumToolArgs {
		return errors.New("invalid client tool arguments")
	}
	now := p.now().UTC()
	_, err = p.d1.Run(
		ctx,
		Statement{SQL: "DELETE FROM pending_client_tools WHERE expires_at <= ?", Params: []any{now.UnixMilli()}},
		Statement{SQL: `INSERT INTO pending_client_tools
			(app_name, user_id, thread_id, call_id, tool_name, args_json, status, created_at, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
			ON CONFLICT(app_name, user_id, thread_id, call_id) DO NOTHING`, Params: []any{scope.AppName, scope.UserID, scope.ThreadID, callID, toolName, string(encoded), now.UnixMilli(), now.Add(pendingToolTTL).UnixMilli()}},
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
	if identity.Public || !validScope(agui.ToolScope{AppName: app, UserID: identity.UserID, ThreadID: thread}) || !agui.ClientCallID.MatchString(callID) {
		return agui.ErrPendingToolNotFound
	}
	encoded, err := json.Marshal(result)
	if err != nil || len(encoded) > maximumToolResult {
		return errors.New("invalid client tool result")
	}
	now := p.now().UTC()
	results, err := p.d1.Run(
		ctx,
		Statement{SQL: "DELETE FROM pending_client_tools WHERE expires_at <= ?", Params: []any{now.UnixMilli()}},
		Statement{
			SQL: `UPDATE pending_client_tools SET result_json = ?, status = 'resolved'
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'pending' AND expires_at > ?`,
			Params: []any{string(encoded), app, identity.UserID, thread, callID, now.UnixMilli()},
		},
	)
	if err != nil {
		return fmt.Errorf("resolve pending client tool: %w", err)
	}
	if len(results) < 2 || results[1].Meta.Changes != 1 {
		return agui.ErrPendingToolNotFound
	}
	return nil
}

func (p *PendingStore) Take(ctx context.Context, identity auth.Identity, app, thread, callID string) (*genai.FunctionResponse, error) {
	if p == nil || p.d1 == nil || identity.Public || !validScope(agui.ToolScope{AppName: app, UserID: identity.UserID, ThreadID: thread}) || !agui.ClientCallID.MatchString(callID) {
		return nil, agui.ErrPendingToolNotFound
	}
	now := p.now().UTC()
	results, err := p.d1.Run(
		ctx,
		Statement{SQL: `SELECT tool_name, args_json, result_json FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'resolved' AND expires_at > ?`, Params: []any{app, identity.UserID, thread, callID, now.UnixMilli()}},
		Statement{SQL: `DELETE FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'resolved' AND expires_at > ?`, Params: []any{app, identity.UserID, thread, callID, now.UnixMilli()}},
	)
	if err != nil {
		return nil, fmt.Errorf("consume pending client tool: %w", err)
	}
	if len(results) < 2 || len(results[0].Rows) != 1 || results[1].Meta.Changes != 1 {
		return nil, agui.ErrPendingToolNotFound
	}
	row := results[0].Rows[0]
	toolName, _ := row["tool_name"].(string)
	argumentsJSON, _ := row["args_json"].(string)
	encoded, _ := row["result_json"].(string)
	if toolName == "" || argumentsJSON == "" || encoded == "" {
		return nil, errors.New("invalid pending client tool record")
	}
	resultJSON := json.RawMessage(encoded)
	if !json.Valid(resultJSON) {
		return nil, errors.New("invalid pending client tool result")
	}
	var response map[string]any
	if json.Unmarshal(resultJSON, &response) != nil || response == nil {
		response = map[string]any{"result": resultJSON}
	}
	var arguments map[string]any
	if json.Unmarshal([]byte(argumentsJSON), &arguments) != nil {
		return nil, errors.New("invalid pending client tool arguments")
	}
	// This reserved server-authored field lets downstream policy bind an
	// approved result to the original request without trusting client payload.
	response["_agui_request"] = arguments
	return &genai.FunctionResponse{ID: callID, Name: toolName, Response: response}, nil
}

func validScope(scope agui.ToolScope) bool {
	for _, value := range []string{scope.AppName, scope.UserID, scope.ThreadID} {
		if strings.TrimSpace(value) == "" || len(value) > 256 || strings.ContainsAny(value, "\x00\r\n") {
			return false
		}
	}
	return true
}
