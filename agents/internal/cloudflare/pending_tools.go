package cloudflare

import (
	"bytes"
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
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

type pendingToolRow struct {
	CallID     string `json:"call_id"`
	ToolName   string `json:"tool_name"`
	ArgsJSON   string `json:"args_json"`
	ResultJSON string `json:"result_json"`
	Status     string `json:"status"`
}

type pendingToolResolution struct {
	Status     string `json:"status"`
	ResultJSON string `json:"result_json"`
}

func (r pendingToolRow) functionResponse(callID string) (*genai.FunctionResponse, error) {
	if r.ToolName == "" || r.ArgsJSON == "" || r.ResultJSON == "" {
		return nil, errors.New("invalid pending client tool record")
	}
	resultJSON := jsontext.Value(r.ResultJSON)
	if !resultJSON.IsValid() {
		return nil, errors.New("invalid pending client tool result")
	}
	var response map[string]any
	if json.Unmarshal(resultJSON, &response) != nil || response == nil {
		response = map[string]any{"result": resultJSON}
	}
	arguments := jsontext.Value(r.ArgsJSON)
	trimmedArguments := bytes.TrimSpace(arguments)
	if !arguments.IsValid() || len(trimmedArguments) == 0 || trimmedArguments[0] != '{' {
		return nil, errors.New("invalid pending client tool arguments")
	}
	// This reserved server-authored field lets downstream policy bind an
	// approved result to the original request without trusting client payload.
	response["_agui_request"] = arguments
	return &genai.FunctionResponse{ID: callID, Name: r.ToolName, Response: response}, nil
}

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

func (p *PendingStore) Register(ctx context.Context, scope agui.ToolScope, callID, toolName string, args jsontext.Value) error {
	if p == nil || p.d1 == nil {
		return errors.New("D1 pending tool store is required")
	}
	if !validScope(scope) || !agui.ClientCallID.MatchString(callID) || !agui.ClientToolName.MatchString(toolName) {
		return errors.New("invalid pending tool identity")
	}
	encoded := bytes.TrimSpace(args)
	if len(encoded) == 0 || bytes.Equal(encoded, []byte("null")) {
		encoded = []byte("{}")
	}
	if !jsontext.Value(encoded).IsValid() || encoded[0] != '{' || len(encoded) > maximumToolArgs {
		return errors.New("invalid client tool arguments")
	}
	now := p.now().UTC()
	_, err := p.d1.Run(
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

func (p *PendingStore) Resolve(ctx context.Context, identity auth.Identity, app, thread, callID string, result jsontext.Value) error {
	if p == nil || p.d1 == nil {
		return errors.New("D1 pending tool store is required")
	}
	if identity.Public || !validScope(agui.ToolScope{AppName: app, UserID: identity.UserID, ThreadID: thread}) || !agui.ClientCallID.MatchString(callID) {
		return agui.ErrPendingToolNotFound
	}
	now := p.now().UTC()
	authorized, err := p.d1.Run(
		ctx,
		Statement{SQL: "DELETE FROM pending_client_tools WHERE expires_at <= ?", Params: []any{now.UnixMilli()}},
		Statement{SQL: `SELECT status, result_json FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status IN ('pending', 'resolved') AND expires_at > ?
			LIMIT 1`, Params: []any{app, identity.UserID, thread, callID, now.UnixMilli()}},
	)
	if err != nil {
		return fmt.Errorf("authorize pending client tool: %w", err)
	}
	if len(authorized) < 2 || len(authorized[1].Rows) != 1 {
		return agui.ErrPendingToolNotFound
	}
	var resolution pendingToolResolution
	if json.Unmarshal(authorized[1].Rows[0], &resolution) != nil || resolution.Status == "" {
		return errors.New("invalid pending client tool record")
	}
	encoded := bytes.TrimSpace(result)
	if len(encoded) == 0 || len(encoded) > maximumToolResult || !jsontext.Value(encoded).IsValid() || encoded[0] != '{' {
		return errors.New("invalid client tool result")
	}
	if resolution.Status == "resolved" {
		if strings.TrimSpace(resolution.ResultJSON) == string(encoded) {
			return nil
		}
		return agui.ErrPendingToolNotFound
	}
	if resolution.Status != "pending" {
		return errors.New("invalid pending client tool status")
	}
	results, err := p.d1.Run(
		ctx,
		Statement{
			SQL: `UPDATE pending_client_tools SET result_json = ?, status = 'resolved'
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ? AND status = 'pending' AND expires_at > ?`,
			Params: []any{string(encoded), app, identity.UserID, thread, callID, now.UnixMilli()},
		},
	)
	if err != nil {
		return fmt.Errorf("resolve pending client tool: %w", err)
	}
	if len(results) != 1 || results[0].Meta.Changes != 1 {
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
	var row pendingToolRow
	if err := json.Unmarshal(results[0].Rows[0], &row); err != nil {
		return nil, errors.New("invalid pending client tool record")
	}
	return row.functionResponse(callID)
}

// ClaimBatch atomically authorizes, resolves, and consumes every result. One
// DELETE ... RETURNING statement is the claim: its count guard makes a missing,
// malformed-scope, conflicting, or already-consumed row delete nothing, while
// SQLite's statement transaction prevents concurrent duplicate claims from
// both succeeding.
func (p *PendingStore) ClaimBatch(ctx context.Context, identity auth.Identity, scope agui.ToolScope, submitted []agui.PendingToolResult) ([]*genai.FunctionResponse, error) {
	if p == nil || p.d1 == nil || identity.Public || identity.UserID != scope.UserID || !validScope(scope) || len(submitted) == 0 {
		return nil, agui.ErrPendingToolNotFound
	}

	resultsByCall := make(map[string]jsontext.Value, len(submitted))
	for _, result := range submitted {
		encoded := bytes.TrimSpace(result.Payload)
		if !agui.ClientCallID.MatchString(result.CallID) || len(encoded) == 0 || len(encoded) > maximumToolResult || !jsontext.Value(encoded).IsValid() || encoded[0] != '{' {
			return nil, errors.New("invalid client tool result")
		}
		if _, duplicate := resultsByCall[result.CallID]; duplicate {
			return nil, errors.New("duplicate client tool result")
		}
		resultsByCall[result.CallID] = append(jsontext.Value(nil), encoded...)
	}

	now := p.now().UTC().UnixMilli()
	callPlaceholders := placeholders(len(submitted))
	var retryConditions strings.Builder
	conditionParams := make([]any, 0, len(submitted)*2)
	callParams := make([]any, 0, len(submitted))
	for index, result := range submitted {
		if index > 0 {
			retryConditions.WriteString(" OR ")
		}
		retryConditions.WriteString("(call_id = ? AND (status = 'pending' OR (status = 'resolved' AND result_json = ?)))")
		callParams = append(callParams, result.CallID)
		conditionParams = append(conditionParams, result.CallID, string(resultsByCall[result.CallID]))
	}

	params := []any{scope.AppName, scope.UserID, scope.ThreadID, now}
	params = append(params, callParams...)
	params = append(params, conditionParams...)
	params = append(params, len(submitted), scope.AppName, scope.UserID, scope.ThreadID, now)
	params = append(params, callParams...)
	params = append(params, conditionParams...)

	statement := Statement{
		SQL: `DELETE FROM pending_client_tools
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND expires_at > ?
			AND call_id IN (` + callPlaceholders + `)
			AND (` + retryConditions.String() + `)
			AND ? = (SELECT COUNT(*) FROM pending_client_tools
				WHERE app_name = ? AND user_id = ? AND thread_id = ? AND expires_at > ?
				AND call_id IN (` + callPlaceholders + `)
				AND (` + retryConditions.String() + `))
			RETURNING call_id, tool_name, args_json, result_json, status`,
		Params: params,
	}
	claimed, err := p.d1.Run(ctx, statement)
	if err != nil {
		return nil, fmt.Errorf("claim pending client tools: %w", err)
	}
	if len(claimed) != 1 || len(claimed[0].Rows) != len(submitted) || claimed[0].Meta.Changes != int64(len(submitted)) {
		return nil, agui.ErrPendingToolNotFound
	}

	rowsByCall := make(map[string]pendingToolRow, len(claimed[0].Rows))
	for _, encoded := range claimed[0].Rows {
		var row pendingToolRow
		if err := json.Unmarshal(encoded, &row); err != nil || !agui.ClientCallID.MatchString(row.CallID) {
			return nil, errors.New("invalid pending client tool record")
		}
		rowsByCall[row.CallID] = row
	}
	responses := make([]*genai.FunctionResponse, 0, len(submitted))
	for _, result := range submitted {
		row, ok := rowsByCall[result.CallID]
		if !ok {
			return nil, errors.New("invalid pending client tool claim")
		}
		if row.Status == "pending" {
			row.ResultJSON = string(resultsByCall[result.CallID])
		} else if row.Status != "resolved" || row.ResultJSON != string(resultsByCall[result.CallID]) {
			return nil, errors.New("invalid pending client tool resolution")
		}
		response, err := row.functionResponse(result.CallID)
		if err != nil {
			return nil, err
		}
		responses = append(responses, response)
	}
	return responses, nil
}

func validScope(scope agui.ToolScope) bool {
	for _, value := range []string{scope.AppName, scope.UserID, scope.ThreadID} {
		if strings.TrimSpace(value) == "" || len(value) > 256 || strings.ContainsAny(value, "\x00\r\n") {
			return false
		}
	}
	return true
}
