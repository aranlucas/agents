package cloudflare

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"maps"
	"slices"
	"strings"
	"sync"
	"time"

	"agents/internal/agui"
	"google.golang.org/adk/v2/session"
)

const sessionTTL = time.Hour

const storedSessionColumns = `session_id, user_id, state_json, updated_at,
	(SELECT state_json FROM app_states WHERE app_name = sessions.app_name) AS app_state_json,
	(SELECT state_json FROM user_states WHERE app_name = sessions.app_name AND user_id = sessions.user_id) AS user_state_json`

var ErrStaleSession = errors.New("session has been modified in storage; reload it before appending events")

type storedSessionRow struct {
	SessionID     string `json:"session_id"`
	UserID        string `json:"user_id"`
	StateJSON     string `json:"state_json"`
	UpdatedAt     int64  `json:"updated_at"`
	AppStateJSON  string `json:"app_state_json"`
	UserStateJSON string `json:"user_state_json"`
}

type storedEventRow struct {
	EventJSON string `json:"event_json"`
}

type sessionPresenceRow struct {
	Present int `json:"present"`
}

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
	state = withoutNil(state)
	encoded, err := json.Marshal(state)
	if err != nil {
		return nil, errors.New("encode session state")
	}
	appJSON, err := json.Marshal(withoutNil(appState))
	if err != nil {
		return nil, errors.New("encode app state")
	}
	userJSON, err := json.Marshal(withoutNil(userState))
	if err != nil {
		return nil, errors.New("encode user state")
	}
	appUpdate, appUpdateParams, err := stateUpdateExpression("state_json", appState)
	if err != nil {
		return nil, errors.New("encode app state")
	}
	userUpdate, userUpdateParams, err := stateUpdateExpression("state_json", userState)
	if err != nil {
		return nil, errors.New("encode user state")
	}
	now := s.now().UTC()
	appParams := append([]any{req.AppName, string(appJSON)}, appUpdateParams...)
	userParams := append([]any{req.AppName, req.UserID, string(userJSON)}, userUpdateParams...)
	result, err := s.d1.Run(
		ctx,
		// Get intentionally hides expired sessions. Reclaim that same identity
		// before inserting so a client can reopen a thread after its TTL without
		// colliding with the expired primary-key row. Delete archived events
		// explicitly as well as through the foreign key because D1 deployments
		// may not have SQLite foreign-key enforcement enabled.
		Statement{SQL: `DELETE FROM session_events
			WHERE app_name = ? AND user_id = ? AND session_id = ?
			AND EXISTS (
				SELECT 1 FROM sessions
				WHERE app_name = session_events.app_name
				AND user_id = session_events.user_id
				AND session_id = session_events.session_id
				AND expires_at <= ?
			)`, Params: []any{req.AppName, req.UserID, id, now.UnixMilli()}},
		Statement{
			SQL: `DELETE FROM sessions
				WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at <= ?`,
			Params: []any{req.AppName, req.UserID, id, now.UnixMilli()},
		},
		Statement{SQL: `INSERT INTO app_states (app_name, state_json) VALUES (?, ?)
			ON CONFLICT(app_name) DO UPDATE SET state_json = ` + appUpdate, Params: appParams},
		Statement{SQL: `INSERT INTO user_states (app_name, user_id, state_json) VALUES (?, ?, ?)
			ON CONFLICT(app_name, user_id) DO UPDATE SET state_json = ` + userUpdate, Params: userParams},
		Statement{
			SQL: `INSERT INTO sessions (app_name, user_id, session_id, state_json, created_at, updated_at, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			Params: []any{req.AppName, req.UserID, id, string(encoded), now.UnixMilli(), now.UnixMilli(), now.Add(sessionTTL).UnixMilli()},
		},
		Statement{SQL: `SELECT ` + storedSessionColumns + ` FROM sessions
			WHERE app_name = ? AND user_id = ? AND session_id = ?`, Params: []any{req.AppName, req.UserID, id}},
	)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	if len(result) < 6 {
		return nil, errors.New("create session returned no result")
	}
	if len(result[5].Rows) == 0 {
		return &session.CreateResponse{Session: newStoredSession(id, req.AppName, req.UserID, state, nil, now)}, nil
	}
	created, err := decodeStoredSession(result[5].Rows[0], req.AppName, nil)
	if err != nil {
		return nil, err
	}
	return &session.CreateResponse{Session: created}, nil
}

func (s *SessionService) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) || !validIdentity(req.SessionID) {
		return nil, errors.New("app name, user ID, and session ID are required")
	}
	now := s.now().UTC()
	results, err := s.d1.Run(
		ctx,
		Statement{SQL: `SELECT ` + storedSessionColumns + ` FROM sessions
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?`, Params: []any{req.AppName, req.UserID, req.SessionID, now.UnixMilli()}},
		Statement{SQL: `SELECT event_json FROM session_events
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND created_at >= ?
			ORDER BY created_at DESC, event_id DESC LIMIT ?`, Params: []any{req.AppName, req.UserID, req.SessionID, afterMillis(req.After), eventLimit(req.NumRecentEvents)}},
	)
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	if len(results) < 2 || len(results[0].Rows) == 0 {
		return nil, agui.ErrSessionNotFound
	}
	events, err := decodeEvents(results[1].Rows)
	if err != nil {
		return nil, err
	}
	slices.Reverse(events)
	stored, err := decodeStoredSession(results[0].Rows[0], req.AppName, events)
	if err != nil {
		return nil, err
	}
	return &session.GetResponse{Session: stored}, nil
}

func (s *SessionService) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	if req == nil || !validIdentity(req.AppName) || req.UserID != "" && !validIdentity(req.UserID) {
		return nil, errors.New("app name is required and user ID must be valid when provided")
	}
	query := `SELECT ` + storedSessionColumns + ` FROM sessions
		WHERE app_name = ? AND expires_at > ?`
	params := []any{req.AppName, s.now().UTC().UnixMilli()}
	if req.UserID != "" {
		query += " AND user_id = ?"
		params = append(params, req.UserID)
	}
	query += " ORDER BY updated_at DESC"
	results, err := s.d1.Run(ctx, Statement{SQL: query, Params: params})
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	response := &session.ListResponse{}
	if len(results) == 0 {
		return response, nil
	}
	for _, raw := range results[0].Rows {
		stored, err := decodeStoredSession(raw, req.AppName, nil)
		if err != nil {
			return nil, err
		}
		response.Sessions = append(response.Sessions, stored)
	}
	return response, nil
}

func (s *SessionService) Delete(ctx context.Context, req *session.DeleteRequest) error {
	if req == nil || !validIdentity(req.AppName) || !validIdentity(req.UserID) || !validIdentity(req.SessionID) {
		return errors.New("app name, user ID, and session ID are required")
	}
	_, err := s.d1.Run(
		ctx,
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
	stored, ok := current.(*storedSession)
	if !ok {
		return fmt.Errorf("unexpected session type %T", current)
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
	// temp: state lives for the invocation but never in D1. Keep the full delta
	// on the live session and original event, matching ADK's in-memory service;
	// the runner yields this same event after AppendEvent returns.
	persistedDelta := withoutTemporary(event.Actions.StateDelta)
	appDelta, userDelta, sessionDelta := splitState(event.Actions.StateDelta)
	appJSON, err := json.Marshal(appDelta)
	if err != nil {
		return errors.New("encode app state")
	}
	userJSON, err := json.Marshal(userDelta)
	if err != nil {
		return errors.New("encode user state")
	}
	appUpdate, appUpdateParams, err := stateUpdateExpression("state_json", appDelta)
	if err != nil {
		return errors.New("encode app state")
	}
	userUpdate, userUpdateParams, err := stateUpdateExpression("state_json", userDelta)
	if err != nil {
		return errors.New("encode user state")
	}
	sessionUpdate, sessionUpdateParams, err := stateUpdateExpression("state_json", sessionDelta)
	if err != nil {
		return errors.New("encode session state")
	}
	persistedEvent := *event
	persistedEvent.Actions = event.Actions
	persistedEvent.Actions.StateDelta = persistedDelta
	eventJSON, err := json.Marshal(&persistedEvent)
	if err != nil {
		return errors.New("encode session event")
	}
	now := s.now().UTC()
	expectedUpdate := current.LastUpdateTime().UTC().UnixMilli()
	updatedMillis := max(now.UnixMilli(), expectedUpdate+1)
	appParams := []any{current.AppName(), string(appJSON), current.AppName(), current.UserID(), current.ID(), now.UnixMilli(), expectedUpdate}
	appParams = append(appParams, appUpdateParams...)
	userParams := []any{current.AppName(), current.UserID(), string(userJSON), current.AppName(), current.UserID(), current.ID(), now.UnixMilli(), expectedUpdate}
	userParams = append(userParams, userUpdateParams...)
	sessionParams := append(sessionUpdateParams, updatedMillis, now.Add(sessionTTL).UnixMilli(), current.AppName(), current.UserID(), current.ID(), now.UnixMilli(), expectedUpdate)
	results, err := s.d1.Run(
		ctx,
		Statement{SQL: `INSERT INTO app_states (app_name, state_json)
			SELECT ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ? AND updated_at = ?)
			ON CONFLICT(app_name) DO UPDATE SET state_json = ` + appUpdate, Params: appParams},
		Statement{SQL: `INSERT INTO user_states (app_name, user_id, state_json)
			SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ? AND updated_at = ?)
			ON CONFLICT(app_name, user_id) DO UPDATE SET state_json = ` + userUpdate, Params: userParams},
		Statement{SQL: `UPDATE sessions SET state_json = ` + sessionUpdate + `, updated_at = ?, expires_at = ?
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ? AND updated_at = ?`, Params: sessionParams},
		Statement{SQL: `INSERT INTO session_events (app_name, user_id, session_id, event_id, invocation_id, event_json, created_at)
			SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`, Params: []any{current.AppName(), current.UserID(), current.ID(), event.ID, event.InvocationID, string(eventJSON), event.Timestamp.UTC().UnixMilli()}},
	)
	if err != nil {
		return fmt.Errorf("append session event: %w", err)
	}
	if len(results) < 3 || results[2].Meta.Changes == 0 {
		active, lookupErr := s.d1.Run(ctx, Statement{SQL: `SELECT 1 AS present FROM sessions
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND expires_at > ?`, Params: []any{current.AppName(), current.UserID(), current.ID(), now.UnixMilli()}})
		if lookupErr != nil {
			return fmt.Errorf("check session revision: %w", lookupErr)
		}
		if len(active) > 0 && len(active[0].Rows) > 0 {
			var row sessionPresenceRow
			if err := json.Unmarshal(active[0].Rows[0], &row); err != nil || row.Present != 1 {
				return errors.New("decode session presence")
			}
			return ErrStaleSession
		}
		return agui.ErrSessionNotFound
	}
	stored.state.applyDelta(event.Actions.StateDelta)
	stored.append(event, time.UnixMilli(updatedMillis).UTC())
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

func withoutNil(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		if !isStateDeletion(value) {
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

func mergeScopedJSON(local map[string]any, appJSON, userJSON string) (map[string]any, error) {
	merged := withoutNil(local)
	for prefix, raw := range map[string]string{session.KeyPrefixApp: appJSON, session.KeyPrefixUser: userJSON} {
		if raw == "" {
			continue
		}
		var values map[string]any
		if err := json.Unmarshal([]byte(raw), &values); err != nil || values == nil {
			return nil, errors.New("decode scoped state")
		}
		for key, value := range values {
			if value != nil {
				merged[prefix+key] = value
			}
		}
	}
	return merged, nil
}

func afterMillis(after time.Time) int64 {
	if after.IsZero() {
		return 0
	}
	return after.UTC().UnixMilli()
}

func eventLimit(requested int) int {
	if requested <= 0 {
		return -1
	}
	return requested
}

// stateUpdateExpression applies the gateway's cross-language state-delta
// semantics in SQLite: JSON values replace the old top-level value and values
// that encode as JSON null (including typed nils) remove the key. json_patch
// cannot be used because it recursively merges object values.
func stateUpdateExpression(column string, delta map[string]any) (string, []any, error) {
	if len(delta) == 0 {
		return column, nil, nil
	}
	keys := slices.Sorted(maps.Keys(delta))
	expression := column
	setArgs := []string{column}
	setParams := make([]any, 0, len(keys)*2)
	removeArgs := make([]string, 0, len(keys)+1)
	removeParams := make([]any, 0, len(keys))
	for _, key := range keys {
		encoded, deletion, err := encodeStateValue(delta[key])
		if err != nil {
			return "", nil, err
		}
		if deletion {
			removeArgs = append(removeArgs, `'$.' || json_quote(?)`)
			removeParams = append(removeParams, key)
			continue
		}
		setArgs = append(setArgs, `'$.' || json_quote(?)`, `json(?)`)
		setParams = append(setParams, key, string(encoded))
	}
	if len(setArgs) > 1 {
		expression = "json_set(" + strings.Join(setArgs, ", ") + ")"
	}
	if len(removeArgs) > 0 {
		removeArgs = append([]string{expression}, removeArgs...)
		expression = "json_remove(" + strings.Join(removeArgs, ", ") + ")"
	}
	return expression, append(setParams, removeParams...), nil
}

func encodeStateValue(value any) (json.RawMessage, bool, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, false, err
	}
	return encoded, bytes.Equal(bytes.TrimSpace(encoded), []byte("null")), nil
}

func isStateDeletion(value any) bool {
	_, deletion, err := encodeStateValue(value)
	return err == nil && deletion
}

func decodeStoredSession(raw json.RawMessage, appName string, events []*session.Event) (*storedSession, error) {
	var row storedSessionRow
	if err := json.Unmarshal(raw, &row); err != nil || !validIdentity(row.SessionID) || !validIdentity(row.UserID) || row.UpdatedAt <= 0 {
		return nil, errors.New("decode session row")
	}
	state, err := decodeStateJSON(row.StateJSON)
	if err != nil {
		return nil, err
	}
	state, err = mergeScopedJSON(state, row.AppStateJSON, row.UserStateJSON)
	if err != nil {
		return nil, err
	}
	return newStoredSession(row.SessionID, appName, row.UserID, state, events, time.UnixMilli(row.UpdatedAt).UTC()), nil
}

func decodeStateJSON(raw string) (map[string]any, error) {
	if raw == "" {
		return nil, errors.New("decode session state")
	}
	var state map[string]any
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return nil, errors.New("decode session state")
	}
	if state == nil {
		return nil, errors.New("decode session state")
	}
	return state, nil
}

func decodeEvents(rows []json.RawMessage) ([]*session.Event, error) {
	events := make([]*session.Event, 0, len(rows))
	for _, raw := range rows {
		var row storedEventRow
		if err := json.Unmarshal(raw, &row); err != nil || row.EventJSON == "" {
			return nil, errors.New("decode session event")
		}
		var event session.Event
		if err := json.Unmarshal([]byte(row.EventJSON), &event); err != nil {
			return nil, errors.New("decode session event")
		}
		events = append(events, &event)
	}
	return events, nil
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

func (s *storedState) applyDelta(delta map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, value := range delta {
		if isStateDeletion(value) {
			delete(s.values, key)
			continue
		}
		s.values[key] = value
	}
}

func (s *storedState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		s.mu.RLock()
		copy := maps.Clone(s.values)
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
