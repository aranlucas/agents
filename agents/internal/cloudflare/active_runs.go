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
)

type activeRunRow struct {
	RunID         string `json:"run_id"`
	Status        string `json:"status"`
	StopRequested int64  `json:"stop_requested"`
}

type activeRunEventRow struct {
	EventJSON string `json:"event_json"`
}

func (s *SessionService) BeginActiveRun(ctx context.Context, key agui.ActiveRunKey, runID string, expiresAt time.Time) error {
	if !validActiveRunKey(key, runID) {
		return errors.New("invalid AG-UI active run identity")
	}
	now := s.now().UTC().UnixMilli()
	results, err := s.d1.Run(ctx,
		Statement{SQL: `DELETE FROM agui_active_runs
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND (status = 'finished' OR expires_at <= ?)`, Params: []any{key.AppName, key.UserID, key.ThreadID, now}},
		Statement{SQL: `INSERT INTO agui_active_runs
			(app_name, user_id, thread_id, run_id, status, stop_requested, created_at, updated_at, expires_at)
			VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?)
			ON CONFLICT(app_name, user_id, thread_id) DO NOTHING`, Params: []any{key.AppName, key.UserID, key.ThreadID, runID, now, now, expiresAt.UTC().UnixMilli()}},
		Statement{SQL: `SELECT run_id, status, stop_requested FROM agui_active_runs
			WHERE app_name = ? AND user_id = ? AND thread_id = ?`, Params: []any{key.AppName, key.UserID, key.ThreadID}},
	)
	if err != nil {
		return fmt.Errorf("begin AG-UI active run: %w", err)
	}
	if len(results) != 3 || len(results[2].Rows) != 1 {
		return agui.ErrActiveRunExists
	}
	var row activeRunRow
	if json.Unmarshal(results[2].Rows[0], &row) != nil || row.RunID != runID || row.Status != "active" {
		return agui.ErrActiveRunExists
	}
	return nil
}

func (s *SessionService) AppendActiveRunEvent(ctx context.Context, key agui.ActiveRunKey, runID string, index int64, encoded []byte, terminal bool) error {
	trimmed := bytes.TrimSpace(encoded)
	if !validActiveRunKey(key, runID) || index < 0 || len(trimmed) == 0 || len(trimmed) > maximumActiveRunEvent || !jsontext.Value(trimmed).IsValid() {
		return errors.New("invalid AG-UI active run event")
	}
	now := s.now().UTC().UnixMilli()
	terminalValue := int64(0)
	if terminal {
		terminalValue = 1
	}
	results, err := s.d1.Run(ctx,
		Statement{SQL: `INSERT INTO agui_active_run_events
			(app_name, user_id, thread_id, run_id, event_index, event_json, created_at)
			SELECT ?, ?, ?, ?, ?, ?, ?
			WHERE EXISTS (SELECT 1 FROM agui_active_runs WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ? AND status = 'active' AND expires_at > ?)
			AND ? = (SELECT COUNT(*) FROM agui_active_run_events WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ?)
			ON CONFLICT(app_name, user_id, thread_id, run_id, event_index) DO NOTHING`, Params: []any{key.AppName, key.UserID, key.ThreadID, runID, index, string(trimmed), now, key.AppName, key.UserID, key.ThreadID, runID, now, index, key.AppName, key.UserID, key.ThreadID, runID}},
		Statement{SQL: `UPDATE agui_active_runs SET updated_at = ?, status = CASE WHEN ? = 1 THEN 'finished' ELSE status END
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ?
			AND EXISTS (SELECT 1 FROM agui_active_run_events WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ? AND event_index = ? AND event_json = ?)`, Params: []any{now, terminalValue, key.AppName, key.UserID, key.ThreadID, runID, key.AppName, key.UserID, key.ThreadID, runID, index, string(trimmed)}},
		Statement{SQL: `SELECT event_json FROM agui_active_run_events
			WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ? AND event_index = ?`, Params: []any{key.AppName, key.UserID, key.ThreadID, runID, index}},
	)
	if err != nil {
		return fmt.Errorf("append AG-UI active run event: %w", err)
	}
	if len(results) != 3 || len(results[2].Rows) != 1 {
		return agui.ErrActiveRunNotFound
	}
	var row activeRunEventRow
	if json.Unmarshal(results[2].Rows[0], &row) != nil || row.EventJSON != string(trimmed) {
		return errors.New("conflicting AG-UI active run event")
	}
	return nil
}

const maximumActiveRunEvent = 1 << 20

func (s *SessionService) CurrentActiveRun(ctx context.Context, key agui.ActiveRunKey) (*agui.ActiveRunSnapshot, error) {
	return s.loadActiveRun(ctx, key, "", true, 0)
}

func (s *SessionService) LoadActiveRun(ctx context.Context, key agui.ActiveRunKey, runID string, fromEvent int64) (*agui.ActiveRunSnapshot, error) {
	return s.loadActiveRun(ctx, key, runID, false, fromEvent)
}

func (s *SessionService) loadActiveRun(ctx context.Context, key agui.ActiveRunKey, runID string, currentOnly bool, fromEvent int64) (*agui.ActiveRunSnapshot, error) {
	if !validActiveRunKey(key, "placeholder") || (!currentOnly && !validRunToken(runID)) {
		return nil, agui.ErrActiveRunNotFound
	}
	now := s.now().UTC().UnixMilli()
	query := `SELECT run_id, status, stop_requested FROM agui_active_runs
		WHERE app_name = ? AND user_id = ? AND thread_id = ? AND expires_at > ?`
	params := []any{key.AppName, key.UserID, key.ThreadID, now}
	if currentOnly {
		query += " AND status = 'active'"
	} else {
		query += " AND run_id = ?"
		params = append(params, runID)
	}
	results, err := s.d1.Run(ctx, Statement{SQL: query, Params: params})
	if err != nil {
		return nil, fmt.Errorf("load AG-UI active run: %w", err)
	}
	if len(results) != 1 || len(results[0].Rows) != 1 {
		return nil, agui.ErrActiveRunNotFound
	}
	var row activeRunRow
	if json.Unmarshal(results[0].Rows[0], &row) != nil || !validRunToken(row.RunID) || (row.Status != "active" && row.Status != "finished") {
		return nil, errors.New("invalid AG-UI active run record")
	}
	snapshot := &agui.ActiveRunSnapshot{RunID: row.RunID, Finished: row.Status == "finished", StopRequested: row.StopRequested != 0}
	if fromEvent < 0 {
		return snapshot, nil
	}
	eventResults, err := s.d1.Run(ctx, Statement{SQL: `SELECT event_json FROM agui_active_run_events
		WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ? AND event_index >= ? ORDER BY event_index`, Params: []any{key.AppName, key.UserID, key.ThreadID, row.RunID, fromEvent}})
	if err != nil {
		return nil, fmt.Errorf("load AG-UI active run events: %w", err)
	}
	if len(eventResults) != 1 {
		return nil, errors.New("invalid AG-UI active run events response")
	}
	for _, encodedRow := range eventResults[0].Rows {
		var eventRow activeRunEventRow
		if json.Unmarshal(encodedRow, &eventRow) != nil || !jsontext.Value(eventRow.EventJSON).IsValid() {
			return nil, errors.New("invalid AG-UI active run event record")
		}
		snapshot.Events = append(snapshot.Events, []byte(eventRow.EventJSON))
	}
	return snapshot, nil
}

func (s *SessionService) FinishActiveRun(ctx context.Context, key agui.ActiveRunKey, runID string, retainUntil time.Time) error {
	if !validActiveRunKey(key, runID) {
		return agui.ErrActiveRunNotFound
	}
	now := s.now().UTC().UnixMilli()
	results, err := s.d1.Run(ctx, Statement{SQL: `UPDATE agui_active_runs SET status = 'finished', updated_at = ?, expires_at = ?
		WHERE app_name = ? AND user_id = ? AND thread_id = ? AND run_id = ?`, Params: []any{now, retainUntil.UTC().UnixMilli(), key.AppName, key.UserID, key.ThreadID, runID}})
	if err != nil {
		return fmt.Errorf("finish AG-UI active run: %w", err)
	}
	if len(results) != 1 || results[0].Meta.Changes != 1 {
		return agui.ErrActiveRunNotFound
	}
	return nil
}

func (s *SessionService) RequestActiveRunStop(ctx context.Context, key agui.ActiveRunKey) (bool, error) {
	if !validActiveRunKey(key, "placeholder") {
		return false, nil
	}
	now := s.now().UTC().UnixMilli()
	results, err := s.d1.Run(ctx, Statement{SQL: `UPDATE agui_active_runs SET stop_requested = 1, updated_at = ?
		WHERE app_name = ? AND user_id = ? AND thread_id = ? AND status = 'active' AND expires_at > ?`, Params: []any{now, key.AppName, key.UserID, key.ThreadID, now}})
	if err != nil {
		return false, fmt.Errorf("stop AG-UI active run: %w", err)
	}
	return len(results) == 1 && results[0].Meta.Changes == 1, nil
}

func validActiveRunKey(key agui.ActiveRunKey, runID string) bool {
	for _, value := range []string{key.AppName, key.UserID, key.ThreadID} {
		if strings.TrimSpace(value) == "" || len(value) > 256 || strings.ContainsAny(value, "\x00\r\n") {
			return false
		}
	}
	return validRunToken(runID)
}

func validRunToken(runID string) bool {
	return strings.TrimSpace(runID) != "" && len(runID) <= 256 && !strings.ContainsAny(runID, "\x00\r\n")
}

var _ agui.ActiveRunStore = (*SessionService)(nil)
