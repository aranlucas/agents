package cloudflare

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/config"
	"google.golang.org/adk/v2/session"
	_ "modernc.org/sqlite"
)

type batchRequest struct {
	Batch []Statement `json:"batch"`
}

func writeEnvelope(t *testing.T, w http.ResponseWriter, results []Result) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{"success": true, "result": results}); err != nil {
		t.Fatal(err)
	}
}

func rawRows(t *testing.T, rows ...any) []json.RawMessage {
	t.Helper()
	encoded := make([]json.RawMessage, len(rows))
	for i, row := range rows {
		data, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		encoded[i] = data
	}
	return encoded
}

func TestD1UsesBoundedAuthenticatedRequestsAndRedactsToken(t *testing.T) {
	const secret = "d1-secret"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+secret {
			t.Fatalf("authorization = %q", got)
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"errors":[{"message":"` + secret + `"}]}`))
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare(secret), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = d1.Run(context.Background(), Statement{SQL: "SELECT 1"})
	if err == nil || strings.Contains(err.Error(), secret) {
		t.Fatalf("Run() error = %v", err)
	}
}

func TestSessionCreateAndAppendNeverPersistTemporaryState(t *testing.T) {
	var mu sync.Mutex
	var batches [][]Statement
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		mu.Lock()
		batches = append(batches, req.Batch)
		mu.Unlock()
		results := make([]Result, len(req.Batch))
		for i := range results {
			results[i] = Result{Success: true}
			results[i].Meta.Changes = 1
		}
		writeEnvelope(t, w, results)
	}))
	defer server.Close()

	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	service := NewSessionService(d1, func() time.Time { return now })
	created, err := service.Create(context.Background(), &session.CreateRequest{
		AppName: "travel_agent", UserID: "user-1", SessionID: "thread-1",
		State: map[string]any{"destination": "Paris", "temp:oauth": "never-store"},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := session.NewEvent(t.Context(), "invocation-1")
	event.Actions.StateDelta = map[string]any{"status": "ready", "temp:token": "also-never-store"}
	if err := service.AppendEvent(context.Background(), created.Session, event); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(batches) != 2 {
		t.Fatalf("batches = %d", len(batches))
	}
	for _, batch := range batches {
		encoded, _ := json.Marshal(batch)
		if strings.Contains(string(encoded), "never-store") {
			t.Fatalf("temporary state persisted: %s", encoded)
		}
	}
	// Temp keys must stay OUT of D1 (checked above) but IN the live
	// in-memory session state: ADK-Go's runner delivers request-scoped
	// OAuth tokens (temp:kroger_token, temp:strava_token) through
	// AppendEvent's StateDelta, and toolsets gate on reading them back
	// via ctx.ReadonlyState(). Mirrors ADK's InMemory service, which
	// maps.Copy's the full delta into session state and only trims temp:
	// keys from the archived event.
	value, err := created.Session.State().Get("temp:token")
	if err != nil || value != "also-never-store" {
		t.Fatalf("temporary state missing from live session (value=%v err=%v); toolsets gated on temp: keys would see no tools", value, err)
	}
}

// TestAppendEventRetainsTempKeysInMemory is a regression test for the
// production bug where grocery and fitness agents had no MCP tools: the
// AG-UI handler forwards X-Kroger-Access-Token / X-Strava-Access-Token as
// temp: state keys via runner.WithStateDelta, the runner hands that delta to
// AppendEvent, and Kroger.Tools / the Strava toolset then read the token
// back from ctx.ReadonlyState(). An earlier version of AppendEvent applied
// the temp-filtered persistedDelta to the in-memory session state, so the
// tokens vanished before any toolset ran — in production only, because
// InMemory-backed tests apply the full delta.
func TestAppendEventRetainsTempKeysInMemory(t *testing.T) {
	var mu sync.Mutex
	var batches [][]Statement
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		mu.Lock()
		batches = append(batches, req.Batch)
		mu.Unlock()
		results := make([]Result, len(req.Batch))
		for i := range results {
			results[i] = Result{Success: true}
			results[i].Meta.Changes = 1
		}
		writeEnvelope(t, w, results)
	}))
	defer server.Close()

	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	service := NewSessionService(d1, func() time.Time { return now })
	created, err := service.Create(context.Background(), &session.CreateRequest{
		AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", State: map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := session.NewEvent(t.Context(), "invocation-1")
	event.Actions.StateDelta = map[string]any{
		"temp:kroger_token": "oauth-bearer-secret",
		"kroger_connected":  true,
	}
	if err := service.AppendEvent(context.Background(), created.Session, event); err != nil {
		t.Fatal(err)
	}

	value, err := created.Session.State().Get("temp:kroger_token")
	if err != nil || value != "oauth-bearer-secret" {
		t.Fatalf("temp:kroger_token missing from in-memory session state (value=%v err=%v)", value, err)
	}
	if connected, err := created.Session.State().Get("kroger_connected"); err != nil || connected != true {
		t.Fatalf("kroger_connected missing from in-memory session state (value=%v err=%v)", connected, err)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, batch := range batches {
		encoded, _ := json.Marshal(batch)
		if strings.Contains(string(encoded), "oauth-bearer-secret") {
			t.Fatalf("temp token persisted to D1: %s", encoded)
		}
	}
}

// TestSessionAppendEventPreservesTemporaryStateOnTheEventItself is a
// regression test: ADK-Go's runner calls SessionService.AppendEvent and then
// yields that same *session.Event to its caller (agui.Handler), which
// converts temp:mcp_app_activity:/temp:a2ui_activity: state-delta keys into
// ACTIVITY_SNAPSHOT events (see internal/agui/converter.go's
// activityEvents). AppendEvent must still keep temp: keys out of D1
// (covered above), and it must NOT strip them
// from the event.Actions.StateDelta it was given — an earlier version of
// this method reassigned event.Actions.StateDelta to a temp-filtered copy,
// which silently broke every activity-emitting tool end-to-end (the MCP
// Apps bridge, trends' generate_a2ui) despite passing unit tests that never
// drove AppendEvent on the way to inspecting the event.
func TestSessionAppendEventPreservesTemporaryStateOnTheEventItself(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		results := make([]Result, len(req.Batch))
		for i := range results {
			results[i] = Result{Success: true}
			results[i].Meta.Changes = 1
		}
		writeEnvelope(t, w, results)
	}))
	defer server.Close()

	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	service := NewSessionService(d1, func() time.Time { return now })
	created, err := service.Create(context.Background(), &session.CreateRequest{
		AppName: "trends_agent", UserID: "user-1", SessionID: "thread-1", State: map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := session.NewEvent(t.Context(), "invocation-1")
	event.Actions.StateDelta = map[string]any{
		"status":                    "ready",
		"temp:a2ui_activity:render": map[string]any{"messageId": "render", "content": "surface"},
	}
	if err := service.AppendEvent(context.Background(), created.Session, event); err != nil {
		t.Fatal(err)
	}
	if _, ok := event.Actions.StateDelta["temp:a2ui_activity:render"]; !ok {
		t.Fatalf("AppendEvent stripped temp: state from the event's own StateDelta: %#v", event.Actions.StateDelta)
	}
	if _, ok := event.Actions.StateDelta["status"]; !ok {
		t.Fatalf("AppendEvent unexpectedly dropped a persistent key from the event's own StateDelta: %#v", event.Actions.StateDelta)
	}
}

func TestSessionGetScopesEveryQueryAndReturnsEventsChronologically(t *testing.T) {
	older := session.NewEvent(t.Context(), "inv-old")
	older.ID = "event-old"
	older.Timestamp = time.UnixMilli(1000).UTC()
	newer := session.NewEvent(t.Context(), "inv-new")
	newer.ID = "event-new"
	newer.Timestamp = time.UnixMilli(2000).UTC()
	olderJSON, _ := json.Marshal(older)
	newerJSON, _ := json.Marshal(newer)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		if len(req.Batch) != 4 {
			t.Fatalf("statements = %d", len(req.Batch))
		}
		if got := req.Batch[3].Params[4]; got != float64(-1) {
			t.Fatalf("zero NumRecentEvents limit = %v, want -1 (unbounded)", got)
		}
		for index, statement := range req.Batch {
			joined := fmt.Sprint(statement.Params)
			if !strings.Contains(joined, "travel_agent") {
				t.Fatalf("unscoped params: %#v", statement.Params)
			}
			if index != 1 && !strings.Contains(joined, "user-1") {
				t.Fatalf("unscoped user params: %#v", statement.Params)
			}
			if (index == 0 || index == 3) && !strings.Contains(joined, "thread-1") {
				t.Fatalf("unscoped session params: %#v", statement.Params)
			}
		}
		writeEnvelope(t, w, []Result{
			{Success: true, Rows: rawRows(t, map[string]any{"state_json": `{"destination":"Paris"}`, "updated_at": int64(1500)})},
			{Success: true, Rows: rawRows(t, map[string]any{"state_json": `{"policy":"shared"}`})},
			{Success: true, Rows: rawRows(t, map[string]any{"state_json": `{"preference":"window"}`})},
			{Success: true, Rows: rawRows(t, map[string]any{"event_json": string(newerJSON)}, map[string]any{"event_json": string(olderJSON)})},
		})
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	service := NewSessionService(d1, func() time.Time { return time.UnixMilli(3000).UTC() })
	response, err := service.Get(context.Background(), &session.GetRequest{AppName: "travel_agent", UserID: "user-1", SessionID: "thread-1"})
	if err != nil {
		t.Fatal(err)
	}
	if got := response.Session.Events().At(0).ID; got != "event-old" {
		t.Fatalf("first event = %q", got)
	}
	if got := response.Session.Events().At(1).ID; got != "event-new" {
		t.Fatalf("second event = %q", got)
	}
	if got, _ := response.Session.State().Get("app:policy"); got != "shared" {
		t.Fatalf("app state = %v", got)
	}
	if got, _ := response.Session.State().Get("user:preference"); got != "window" {
		t.Fatalf("user state = %v", got)
	}
}

func TestSessionListSupportsOfficialAppWideShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		if len(req.Batch) != 1 || strings.Contains(req.Batch[0].SQL, "user_id = ?") {
			t.Fatalf("app-wide list query = %#v", req.Batch)
		}
		writeEnvelope(t, w, []Result{{Success: true, Rows: rawRows(t,
			map[string]any{"session_id": "thread-a", "user_id": "user-a", "state_json": `{}`, "updated_at": int64(1000), "app_state_json": `{}`, "user_state_json": `{}`},
			map[string]any{"session_id": "thread-b", "user_id": "user-b", "state_json": `{}`, "updated_at": int64(900), "app_state_json": `{}`, "user_state_json": `{}`},
		)}})
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	service := NewSessionService(d1, func() time.Time { return time.UnixMilli(2000).UTC() })
	response, err := service.List(t.Context(), &session.ListRequest{AppName: "app"})
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Sessions) != 2 || response.Sessions[0].UserID() != "user-a" || response.Sessions[1].UserID() != "user-b" {
		t.Fatalf("sessions = %#v", response.Sessions)
	}
}

func TestStateUpdateExpressionReplacesTopLevelObjectsAndDeletesNil(t *testing.T) {
	var typedNil *string
	delta := map[string]any{
		"nullable":       nil,
		"profile":        map[string]any{"name": "Ada"},
		"typed_nullable": typedNil,
	}
	expression, params, err := stateUpdateExpression("state_json", delta)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(expression, "json_patch") || !strings.HasPrefix(expression, "json_remove(json_set(") {
		t.Fatalf("expression = %q", expression)
	}
	if got := fmt.Sprint(params); got != `[profile {"name":"Ada"} nullable typed_nullable]` {
		t.Fatalf("params = %s", got)
	}
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	if _, err := db.Exec(`CREATE TABLE state (state_json TEXT NOT NULL); INSERT INTO state VALUES ('{"nullable":"old","typed_nullable":"old","profile":{"name":"Grace","stale":true}}')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE state SET state_json = "+expression, params...); err != nil {
		t.Fatal(err)
	}
	var raw string
	if err := db.QueryRow("SELECT state_json FROM state").Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	_, hasNil := got["nullable"]
	_, hasTypedNil := got["typed_nullable"]
	if hasNil || hasTypedNil || fmt.Sprint(got["profile"]) != "map[name:Ada]" {
		t.Fatalf("updated state = %#v", got)
	}
}

func TestTypedSessionRowsRejectMissingOrWrongColumns(t *testing.T) {
	valid := rawRows(t, map[string]any{"state_json": `{"status":"ready"}`, "updated_at": int64(1500)})[0]
	state, updated, err := decodeSessionRow(valid)
	if err != nil || state["status"] != "ready" || updated.UnixMilli() != 1500 {
		t.Fatalf("state=%#v updated=%v err=%v", state, updated, err)
	}

	for name, row := range map[string]any{
		"missing timestamp": map[string]any{"state_json": `{}`},
		"wrong timestamp":   map[string]any{"state_json": `{}`, "updated_at": "recently"},
		"missing state":     map[string]any{"updated_at": int64(1500)},
	} {
		t.Run(name, func(t *testing.T) {
			raw := rawRows(t, row)[0]
			if _, _, err := decodeSessionRow(raw); err == nil {
				t.Fatalf("malformed row accepted: %s", raw)
			}
		})
	}
}

func TestAppendEventDeletesNilFromLiveSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		if len(req.Batch) == 4 && !strings.Contains(req.Batch[2].SQL, "json_remove(") {
			t.Fatalf("session update does not delete nil state: %s", req.Batch[2].SQL)
		}
		results := make([]Result, len(req.Batch))
		for i := range results {
			results[i].Success = true
			results[i].Meta.Changes = 1
		}
		writeEnvelope(t, w, results)
	}))
	defer server.Close()

	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	service := NewSessionService(d1, func() time.Time { return time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC) })
	created, err := service.Create(t.Context(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "user-1", SessionID: "thread-1", State: map[string]any{"obsolete": "value"},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := session.NewEvent(t.Context(), "invocation-1")
	event.Actions.StateDelta = map[string]any{"obsolete": nil}
	if err := service.AppendEvent(t.Context(), created.Session, event); err != nil {
		t.Fatal(err)
	}
	if _, err := created.Session.State().Get("obsolete"); !errors.Is(err, session.ErrStateKeyNotExist) {
		t.Fatalf("deleted state Get() error = %v", err)
	}
}

func TestAppendEventRejectsStaleSessionWithoutApplyingLiveDelta(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		if requests == 1 {
			results := make([]Result, len(req.Batch))
			for i := range results {
				results[i].Success = true
			}
			writeEnvelope(t, w, results)
			return
		}
		writeEnvelope(t, w, []Result{{Success: true, Rows: rawRows(t, map[string]any{"present": 1})}})
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	service := NewSessionService(d1, func() time.Time { return now })
	current := newStoredSession("thread", "app", "user", map[string]any{"status": "old"}, nil, now.Add(-time.Minute))
	event := session.NewEvent(t.Context(), "inv")
	event.Actions.StateDelta = map[string]any{"status": "new"}
	if err := service.AppendEvent(t.Context(), current, event); !errors.Is(err, ErrStaleSession) {
		t.Fatalf("AppendEvent() error = %v, want ErrStaleSession", err)
	}
	if got, _ := current.State().Get("status"); got != "old" {
		t.Fatalf("live state changed after rejected append: %v", got)
	}
}

func TestPartialEventIsNotSentToD1(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		writeEnvelope(t, w, []Result{})
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	service := NewSessionService(d1, time.Now)
	current := newStoredSession("thread", "app", "user", map[string]any{}, nil, time.Now())
	event := session.NewEvent(t.Context(), "inv")
	event.Partial = true
	if err := service.AppendEvent(context.Background(), current, event); err != nil {
		t.Fatal(err)
	}
	if requests != 0 {
		t.Fatalf("D1 requests = %d", requests)
	}
}

func TestRunMigrationsIsIdempotentSQLBatch(t *testing.T) {
	var batches [][]Statement
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req batchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatal(err)
		}
		batches = append(batches, req.Batch)
		results := make([]Result, len(req.Batch))
		for i := range results {
			results[i] = Result{Success: true}
		}
		writeEnvelope(t, w, results)
	}))
	defer server.Close()
	d1, err := newD1(testCloudflare("token"), server.Client(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := d1.RunMigrations(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := d1.RunMigrations(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(batches) != 6 || len(batches[0]) != len(batches[3]) || len(batches[1]) != len(batches[4]) || len(batches[2]) != len(batches[5]) {
		t.Fatalf("migration batches = %#v", batches)
	}
	encoded, _ := json.Marshal(batches[0])
	if !strings.Contains(string(encoded), "CREATE TABLE IF NOT EXISTS sessions") {
		t.Fatalf("initial schema missing: %s", encoded)
	}
	telegramSchema, _ := json.Marshal(batches[1])
	if !strings.Contains(string(telegramSchema), "telegram_account_links") {
		t.Fatalf("Telegram schema missing: %s", telegramSchema)
	}
	fitnessSchema, _ := json.Marshal(batches[2])
	if !strings.Contains(string(fitnessSchema), "fitness_activities") {
		t.Fatalf("fitness schema missing: %s", fitnessSchema)
	}
}

func testCloudflare(token string) config.Cloudflare {
	return config.Cloudflare{AccountID: "account", APIToken: token, D1DatabaseID: "database"}
}
