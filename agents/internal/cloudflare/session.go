package cloudflare

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"strconv"
	"strings"
	"sync"
	"time"

	"google.golang.org/adk/v2/session"
)

const sessionTTL = time.Hour

// ErrSessionNotFound is returned when the full app/user/thread identity does
// not address a live session.
var ErrSessionNotFound = errors.New("session not found")

// SessionService persists ADK sessions and events exclusively in D1.
type SessionService struct {
	d1  *D1
	now func() time.Time
}

var _ session.Service = (*SessionService)(nil)

// NewSessionService constructs a D1-backed ADK session service.
func NewSessionService(d1 *D1, now func() time.Time) session.Service {
	if now == nil {
		now = time.Now
	}
	return &SessionService{d1: d1, now: now}
}

func (s *SessionService) Create(ctx context.Context, req *session.CreateRequest) (*session.CreateResponse, error) {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) {
		return nil, errors.New("app name and user ID are required")
	}
	id := strings.TrimSpace(req.SessionID)
	if id == "" {
		id = randomID()
	}
	if !validIdentity(id) {
		return nil, errors.New("invalid session ID")
	}
	appState, userState, state := splitState(req.State)
	encoded, err := json.Marshal(state)
	if err != nil {
		return nil, errors.New("encode session state")
	}
	appJSON, err := json.Marshal(appState)
	if err != nil {
		return nil, errors.New("encode app state")
	}
	userJSON, err := json.Marshal(userState)
	if err != nil {
		return nil, errors.New("encode user state")
	}
	now := s.now().UTC()
	result, err := s.d1.Run(ctx,
		Statement{SQL: `INSERT INTO app_states (app_name, state_json) VALUES (?, ?)
			ON CONFLICT(app_name) DO UPDATE SET state_json = json_patch(state_json, excluded.state_json)`, Params: []any{req.AppName, string(appJSON)}},
		Statement{SQL: `INSERT INTO user_states (app_name, user_id, state_json) VALUES (?, ?, ?)
			ON CONFLICT(app_name, user_id) DO UPDATE SET state_json = json_patch(state_json, excluded.state_json)`, Params: []any{req.AppName, req.UserID, string(userJSON)}},
		Statement{SQL: `INSERT INTO sessions (app_name, user_id, session_id, state_json, created_at, updated_at, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			Params: []any{req.AppName, req.UserID, id, string(encoded), now.UnixMilli(), now.UnixMilli(), now.Add(sessionTTL).UnixMilli()},
		},
		Statement{SQL: "SELECT state_json FROM app_states WHERE app_name = ?", Params: []any{req.AppName}},
		Statement{SQL: "SELECT state_json FROM user_states WHERE app_name = ? AND user_id = ?", Params: []any{req.AppName, req.UserID}},
	)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	if len(result) < 5 {
		return nil, errors.New("create session returned no result")
	}
	state = mergeScopedRows(state, result[3].Rows, result[4].Rows)
	return &session.CreateResponse{Session: newStoredSession(id, req.AppName, req.UserID, state, nil, now)}, nil
}

func (s *SessionService) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) || !validIdentity(req.SessionID) {
		return nil, errors.New("app name, user ID, and session ID are required")
	}
	now := s.now().UTC()
	results, err := s.d1.Run(ctx,
		Statement{SQL: `SELECT state_json, updated_at FROM sessions
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?`, Params: []any{req.AppName, req.UserID, req.SessionID, now.UnixMilli()}},
		Statement{SQL: "SELECT state_json FROM app_states WHERE app_name = ?", Params: []any{req.AppName}},
		Statement{SQL: "SELECT state_json FROM user_states WHERE app_name = ? AND user_id = ?", Params: []any{req.AppName, req.UserID}},
		Statement{SQL: `SELECT event_json FROM session_events
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND created_at >= ?
			ORDER BY created_at DESC, event_id DESC LIMIT ?`, Params: []any{req.AppName, req.UserID, req.SessionID, afterMillis(req.After), eventLimit(req.NumRecentEvents)}},
	)
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	if len(results) < 4 || len(results[0].Rows) == 0 {
		return nil, ErrSessionNotFound
	}
	state, updated, err := decodeSessionRow(results[0].Rows[0])
	if err != nil {
		return nil, err
	}
	state = mergeScopedRows(state, results[1].Rows, results[2].Rows)
	events, err := decodeEvents(results[3].Rows)
	if err != nil {
		return nil, err
	}
	reverse(events)
	return &session.GetResponse{Session: newStoredSession(req.SessionID, req.AppName, req.UserID, state, events, updated)}, nil
}

func (s *SessionService) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) {
		return nil, errors.New("app name and user ID are required")
	}
	results, err := s.d1.Run(ctx, Statement{SQL: `SELECT session_id, state_json, updated_at,
		(SELECT state_json FROM app_states WHERE app_name = sessions.app_name) AS app_state_json,
		(SELECT state_json FROM user_states WHERE app_name = sessions.app_name AND user_id = sessions.user_id) AS user_state_json
		FROM sessions
		WHERE app_name = ? AND user_id = ? AND expires_at > ? ORDER BY updated_at DESC`, Params: []any{req.AppName, req.UserID, s.now().UTC().UnixMilli()}})
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	response := &session.ListResponse{}
	if len(results) == 0 {
		return response, nil
	}
	for _, row := range results[0].Rows {
		id, ok := row["session_id"].(string)
		if !ok {
			return nil, errors.New("decode session ID")
		}
		state, updated, err := decodeSessionRow(row)
		if err != nil {
			return nil, err
		}
		state = mergeScopedJSON(state, stringValue(row["app_state_json"]), stringValue(row["user_state_json"]))
		response.Sessions = append(response.Sessions, newStoredSession(id, req.AppName, req.UserID, state, nil, updated))
	}
	return response, nil
}

func (s *SessionService) Delete(ctx context.Context, req *session.DeleteRequest) error {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) || !validIdentity(req.SessionID) {
		return errors.New("app name, user ID, and session ID are required")
	}
	_, err := s.d1.Run(ctx,
		Statement{SQL: "DELETE FROM session_events WHERE app_name = ? AND user_id = ? AND session_id = ?", Params: []any{req.AppName, req.UserID, req.SessionID}},
		Statement{SQL: "DELETE FROM sessions WHERE app_name = ? AND user_id = ? AND session_id = ?", Params: []any{req.AppName, req.UserID, req.SessionID}},
	)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *SessionService) AppendEvent(ctx context.Context, current session.Session, event *session.Event) error {
	if current == nil || event == nil {
		return errors.New("session and event are required")
	}
	if !validIdentity(current.AppName()) || !validIdentity(current.UserID()) || !validIdentity(current.ID()) {
		return errors.New("invalid session identity")
	}
	if event.Partial {
		return nil
	}
	if event.ID == "" {
		event.ID = randomID()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = s.now().UTC()
	}
	event.Actions.StateDelta = withoutTemporary(event.Actions.StateDelta)
	appDelta, userDelta, sessionDelta := splitState(event.Actions.StateDelta)
	stateJSON, err := json.Marshal(sessionDelta)
	if err != nil {
		return errors.New("encode session state")
	}
	appJSON, err := json.Marshal(appDelta)
	if err != nil {
		return errors.New("encode app state")
	}
	userJSON, err := json.Marshal(userDelta)
	if err != nil {
		return errors.New("encode user state")
	}
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return errors.New("encode session event")
	}
	now := s.now().UTC()
	results, err := s.d1.Run(ctx,
		Statement{SQL: `INSERT INTO app_states (app_name, state_json)
			SELECT ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?)
			ON CONFLICT(app_name) DO UPDATE SET state_json = json_patch(state_json, excluded.state_json)`, Params: []any{current.AppName(), string(appJSON), current.AppName(), current.UserID(), current.ID(), now.UnixMilli()}},
		Statement{SQL: `INSERT INTO user_states (app_name, user_id, state_json)
			SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?)
			ON CONFLICT(app_name, user_id) DO UPDATE SET state_json = json_patch(state_json, excluded.state_json)`, Params: []any{current.AppName(), current.UserID(), string(userJSON), current.AppName(), current.UserID(), current.ID(), now.UnixMilli()}},
		Statement{SQL: `UPDATE sessions SET state_json = json_patch(state_json, ?), updated_at = ?, expires_at = ?
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?`, Params: []any{string(stateJSON), now.UnixMilli(), now.Add(sessionTTL).UnixMilli(), current.AppName(), current.UserID(), current.ID(), now.UnixMilli()}},
		Statement{SQL: `INSERT INTO session_events (app_name, user_id, session_id, event_id, invocation_id, event_json, created_at)
			SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`, Params: []any{current.AppName(), current.UserID(), current.ID(), event.ID, event.InvocationID, string(eventJSON), event.Timestamp.UTC().UnixMilli()}},
	)
	if err != nil {
		return fmt.Errorf("append session event: %w", err)
	}
	if len(results) < 3 || results[2].Meta.Changes == 0 {
		return ErrSessionNotFound
	}
	for key, value := range event.Actions.StateDelta {
		if err := current.State().Set(key, value); err != nil {
			return fmt.Errorf("apply state delta: %w", err)
		}
	}
	if stored, ok := current.(*storedSession); ok {
		stored.append(event, now)
	}
	return nil
}

func validIdentity(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && len(value) <= 256 && !strings.ContainsAny(value, "\x00\r\n")
}

func randomID() string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic("crypto/rand unavailable")
	}
	return hex.EncodeToString(data[:])
}

func withoutTemporary(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		if !strings.HasPrefix(key, session.KeyPrefixTemp) {
			output[key] = value
		}
	}
	return output
}

func splitState(input map[string]any) (app, user, local map[string]any) {
	app, user, local = make(map[string]any), make(map[string]any), make(map[string]any)
	for key, value := range input {
		switch {
		case strings.HasPrefix(key, session.KeyPrefixTemp):
			continue
		case strings.HasPrefix(key, session.KeyPrefixApp):
			app[strings.TrimPrefix(key, session.KeyPrefixApp)] = value
		case strings.HasPrefix(key, session.KeyPrefixUser):
			user[strings.TrimPrefix(key, session.KeyPrefixUser)] = value
		default:
			local[key] = value
		}
	}
	return app, user, local
}

func mergeScopedRows(local map[string]any, appRows, userRows []map[string]any) map[string]any {
	var appJSON, userJSON string
	if len(appRows) > 0 {
		appJSON = stringValue(appRows[0]["state_json"])
	}
	if len(userRows) > 0 {
		userJSON = stringValue(userRows[0]["state_json"])
	}
	return mergeScopedJSON(local, appJSON, userJSON)
}

func mergeScopedJSON(local map[string]any, appJSON, userJSON string) map[string]any {
	merged := make(map[string]any, len(local))
	for key, value := range local {
		merged[key] = value
	}
	for prefix, raw := range map[string]string{session.KeyPrefixApp: appJSON, session.KeyPrefixUser: userJSON} {
		if raw == "" {
			continue
		}
		var values map[string]any
		if json.Unmarshal([]byte(raw), &values) != nil {
			continue
		}
		for key, value := range values {
			merged[prefix+key] = value
		}
	}
	return merged
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func afterMillis(after time.Time) int64 {
	if after.IsZero() {
		return 0
	}
	return after.UTC().UnixMilli()
}

func eventLimit(requested int) int {
	if requested <= 0 || requested > 1000 {
		return 1000
	}
	return requested
}

func decodeSessionRow(row map[string]any) (map[string]any, time.Time, error) {
	raw, ok := row["state_json"].(string)
	if !ok {
		return nil, time.Time{}, errors.New("decode session state")
	}
	var state map[string]any
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return nil, time.Time{}, errors.New("decode session state")
	}
	millis, err := int64Value(row["updated_at"])
	if err != nil {
		return nil, time.Time{}, errors.New("decode session timestamp")
	}
	return state, time.UnixMilli(millis).UTC(), nil
}

func decodeEvents(rows []map[string]any) ([]*session.Event, error) {
	events := make([]*session.Event, 0, len(rows))
	for _, row := range rows {
		raw, ok := row["event_json"].(string)
		if !ok {
			return nil, errors.New("decode session event")
		}
		var event session.Event
		if err := json.Unmarshal([]byte(raw), &event); err != nil {
			return nil, errors.New("decode session event")
		}
		events = append(events, &event)
	}
	return events, nil
}

func int64Value(value any) (int64, error) {
	switch value := value.(type) {
	case float64:
		return int64(value), nil
	case json.Number:
		return value.Int64()
	case int64:
		return value, nil
	case string:
		return strconv.ParseInt(value, 10, 64)
	default:
		return 0, fmt.Errorf("unexpected numeric type %T", value)
	}
}

func reverse(events []*session.Event) {
	for left, right := 0, len(events)-1; left < right; left, right = left+1, right-1 {
		events[left], events[right] = events[right], events[left]
	}
}

type storedSession struct {
	id, appName, userID string
	state               *storedState
	mu                  sync.RWMutex
	events              []*session.Event
	updated             time.Time
}

func newStoredSession(id, appName, userID string, state map[string]any, events []*session.Event, updated time.Time) *storedSession {
	return &storedSession{id: id, appName: appName, userID: userID, state: &storedState{values: state}, events: events, updated: updated}
}

func (s *storedSession) ID() string             { return s.id }
func (s *storedSession) AppName() string        { return s.appName }
func (s *storedSession) UserID() string         { return s.userID }
func (s *storedSession) State() session.State   { return s.state }
func (s *storedSession) Events() session.Events { return (*storedEvents)(s) }
func (s *storedSession) LastUpdateTime() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.updated
}
func (s *storedSession) append(event *session.Event, updated time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
	s.updated = updated
}

type storedState struct {
	mu     sync.RWMutex
	values map[string]any
}

func (s *storedState) Get(key string) (any, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.values[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (s *storedState) Set(key string, value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[key] = value
	return nil
}

func (s *storedState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		s.mu.RLock()
		copy := make(map[string]any, len(s.values))
		for key, value := range s.values {
			copy[key] = value
		}
		s.mu.RUnlock()
		for key, value := range copy {
			if !yield(key, value) {
				return
			}
		}
	}
}

type storedEvents storedSession

func (e *storedEvents) All() iter.Seq[*session.Event] {
	return func(yield func(*session.Event) bool) {
		e.mu.RLock()
		events := append([]*session.Event(nil), e.events...)
		e.mu.RUnlock()
		for _, event := range events {
			if !yield(event) {
				return
			}
		}
	}
}
func (e *storedEvents) Len() int { e.mu.RLock(); defer e.mu.RUnlock(); return len(e.events) }
func (e *storedEvents) At(index int) *session.Event {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.events[index]
}
