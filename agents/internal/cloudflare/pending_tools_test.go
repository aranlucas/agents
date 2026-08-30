package cloudflare

import (
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/agui"
	"agents/internal/auth"
	"agents/internal/config"
)

func TestClientToolResultCannotResolveOrResumeAnotherUsersCall(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call-1", "confirm_booking", jsontext.Value(`{"flight":"one"}`)); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1", jsontext.Value(`not-json`)); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("cross-user Resolve() error = %v", err)
	}
	if _, err := pending.Take(t.Context(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1"); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("cross-user Take() error = %v", err)
	}
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", jsontext.Value(`{"approved":true}`)); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(t.Context(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1")
	if err != nil || response.Name != "confirm_booking" || response.ID != "call-1" || response.Response["approved"] != true {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
	if _, err := pending.Take(t.Context(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1"); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("replayed Take() error = %v", err)
	}
}

func TestApprovalResultResumesOnlyOriginalTravelThread(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "collab_trip_agent", UserID: "user-a", ThreadID: "travel-thread-a"}
	if err := pending.Register(t.Context(), scope, "approval-1", "request_user_approval", jsontext.Value(`{"action":"book_flight"}`)); err != nil {
		t.Fatal(err)
	}
	identity := auth.Identity{UserID: "user-a"}
	for _, other := range []struct{ app, thread string }{{"collab_trip_agent", "travel-thread-b"}, {"grocery_agent", "travel-thread-a"}} {
		if err := pending.Resolve(t.Context(), identity, other.app, other.thread, "approval-1", jsontext.Value(`not-json`)); !errors.Is(err, agui.ErrPendingToolNotFound) {
			t.Fatalf("cross-scope resolve %s/%s = %v", other.app, other.thread, err)
		}
	}
	if err := pending.Resolve(t.Context(), identity, scope.AppName, scope.ThreadID, "approval-1", jsontext.Value(`{"approved":true}`)); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(t.Context(), identity, scope.AppName, scope.ThreadID, "approval-1")
	if err != nil {
		t.Fatal(err)
	}
	requestJSON, ok := response.Response["_agui_request"].(jsontext.Value)
	var request struct {
		Action string `json:"action"`
	}
	if !ok || json.Unmarshal(requestJSON, &request) != nil {
		t.Fatalf("Take() request = %#v", response.Response["_agui_request"])
	}
	if response.Name != "request_user_approval" || response.Response["approved"] != true || request.Action != "book_flight" {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
}

func TestRegisterAcceptsNonIdentifierShapedProviderCallID(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "oralboards", UserID: "user-a", ThreadID: "thread-a"}
	// Some providers (e.g. OpenRouter's tencent/hy3:free) issue tool-call IDs
	// that don't look like identifiers, such as a bare leading digit. These
	// are still valid opaque correlation tokens and must round-trip.
	if err := pending.Register(t.Context(), scope, "0", "ask_question", jsontext.Value(`{"question":"..."}`)); err != nil {
		t.Fatalf("Register() with numeric call ID = %v", err)
	}
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-a"}, "oralboards", "thread-a", "0", jsontext.Value(`{"answer":"..."}`)); err != nil {
		t.Fatalf("Resolve() with numeric call ID = %v", err)
	}
	response, err := pending.Take(t.Context(), auth.Identity{UserID: "user-a"}, "oralboards", "thread-a", "0")
	if err != nil || response.ID != "0" {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
}

func TestRegisterRejectsControlCharacterCallID(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "oralboards", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call\n1", "ask_question", nil); err == nil {
		t.Fatal("Register() with control character in call ID should fail")
	}
}

func TestRegisterBatchConflictLeavesEveryNewCallUnregistered(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call-existing", "approve", jsontext.Value(`{"value":1}`)); err != nil {
		t.Fatal(err)
	}
	err := pending.RegisterBatch(t.Context(), scope, []agui.PendingToolCall{
		{CallID: "call-new", ToolName: "approve", Args: jsontext.Value(`{"value":2}`)},
		{CallID: "call-existing", ToolName: "approve", Args: jsontext.Value(`{"value":3}`)},
	})
	if err == nil {
		t.Fatal("conflicting batch registration succeeded")
	}
	store.mu.Lock()
	_, orphaned := store.records[recordKey(scope.AppName, scope.UserID, scope.ThreadID, "call-new")]
	store.mu.Unlock()
	if orphaned {
		t.Fatal("earlier call from conflicting batch remained registered")
	}
}

func TestPendingToolRowKeepsOriginalRequestAsValidatedJSON(t *testing.T) {
	response, err := (pendingToolRow{
		ToolName:   "request_user_approval",
		ArgsJSON:   `{"action":"book_flight"}`,
		ResultJSON: `{"approved":true}`,
	}).functionResponse("call-1")
	if err != nil {
		t.Fatal(err)
	}
	requestJSON, ok := response.Response["_agui_request"].(jsontext.Value)
	if !ok || string(requestJSON) != `{"action":"book_flight"}` {
		t.Fatalf("_agui_request = %#v", response.Response["_agui_request"])
	}
	if _, err := (pendingToolRow{ToolName: "tool", ArgsJSON: `[]`, ResultJSON: `{}`}).functionResponse("call-1"); err == nil {
		t.Fatal("array arguments should be rejected")
	}
}

func TestPendingToolExpiryAndPublicIdentityFailClosed(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	if err := pending.Register(t.Context(), agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}, "call-1", "approve", nil); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "anonymous", Public: true}, "travel", "thread-a", "call-1", jsontext.Value(`not-json`)); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("public Resolve() = %v", err)
	}
	now = now.Add(pendingToolTTL + time.Second)
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", jsontext.Value(`{}`)); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("expired Resolve() = %v", err)
	}
}

func TestResolvePersistsOnlyBoundedJSONObject(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call-1", "confirm_booking", jsontext.Value(`{}`)); err != nil {
		t.Fatal(err)
	}
	invalid := map[string]jsontext.Value{
		"empty":        nil,
		"null":         jsontext.Value(`null`),
		"array":        jsontext.Value(`[]`),
		"boolean":      jsontext.Value(`true`),
		"malformed":    jsontext.Value(`{"approved":`),
		"over maximum": jsontext.Value(`{"value":"` + strings.Repeat("x", maximumToolResult) + `"}`),
	}
	for name, payload := range invalid {
		t.Run(name, func(t *testing.T) {
			if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-a"}, scope.AppName, scope.ThreadID, "call-1", payload); err == nil || errors.Is(err, agui.ErrPendingToolNotFound) {
				t.Fatalf("Resolve() error = %v, want invalid payload error", err)
			}
		})
	}
	if err := pending.Resolve(t.Context(), auth.Identity{UserID: "user-a"}, scope.AppName, scope.ThreadID, "call-1", jsontext.Value(" \n {\"approved\":true} \t")); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(t.Context(), auth.Identity{UserID: "user-a"}, scope.AppName, scope.ThreadID, "call-1")
	if err != nil || response.Response["approved"] != true {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
}

func TestResolveIsIdempotentUntilTheResultIsConsumed(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	identity := auth.Identity{UserID: scope.UserID}
	if err := pending.Register(t.Context(), scope, "call-1", "confirm_booking", jsontext.Value(`{}`)); err != nil {
		t.Fatal(err)
	}
	result := jsontext.Value(`{"approved":true}`)
	if err := pending.Resolve(t.Context(), identity, scope.AppName, scope.ThreadID, "call-1", result); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(t.Context(), identity, scope.AppName, scope.ThreadID, "call-1", result); err != nil {
		t.Fatalf("retry Resolve() = %v", err)
	}
	if err := pending.Resolve(t.Context(), identity, scope.AppName, scope.ThreadID, "call-1", jsontext.Value(`{"approved":false}`)); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("conflicting retry Resolve() = %v", err)
	}
	response, err := pending.Take(t.Context(), identity, scope.AppName, scope.ThreadID, "call-1")
	if err != nil || response.Response["approved"] != true {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
}

func TestClaimBatchValidatesEveryPayloadBeforeConsumingAnyCall(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	for _, callID := range []string{"call-1", "call-2"} {
		if err := pending.Register(t.Context(), scope, callID, "confirm_booking", jsontext.Value(`{"trip":"one"}`)); err != nil {
			t.Fatal(err)
		}
	}
	identity := auth.Identity{UserID: scope.UserID}
	malformed := []agui.PendingToolResult{
		{CallID: "call-1", Payload: jsontext.Value(`{"approved":true}`)},
		{CallID: "call-2", Payload: jsontext.Value(`[]`)},
	}
	if _, err := pending.ClaimBatch(t.Context(), identity, scope, malformed); err == nil {
		t.Fatal("ClaimBatch accepted malformed second payload")
	}
	valid := []agui.PendingToolResult{
		{CallID: "call-1", Payload: jsontext.Value(`{"approved":true}`)},
		{CallID: "call-2", Payload: jsontext.Value(`{"approved":false}`)},
	}
	responses, err := pending.ClaimBatch(t.Context(), identity, scope, valid)
	if err != nil || len(responses) != 2 {
		t.Fatalf("ClaimBatch after malformed retry = %#v, %v", responses, err)
	}
}

func TestClaimBatchAcceptsIdenticalResolvedRetryAndRejectsWrongScope(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call-1", "confirm_booking", jsontext.Value(`{"trip":"one"}`)); err != nil {
		t.Fatal(err)
	}
	result := jsontext.Value(`{"approved":true}`)
	identity := auth.Identity{UserID: scope.UserID}
	if err := pending.Resolve(t.Context(), identity, scope.AppName, scope.ThreadID, "call-1", result); err != nil {
		t.Fatal(err)
	}
	if _, err := pending.ClaimBatch(t.Context(), auth.Identity{UserID: "user-b"}, scope, []agui.PendingToolResult{{CallID: "call-1", Payload: result}}); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("cross-user ClaimBatch error = %v", err)
	}
	responses, err := pending.ClaimBatch(t.Context(), identity, scope, []agui.PendingToolResult{{CallID: "call-1", Payload: result}})
	if err != nil || len(responses) != 1 || responses[0].Response["approved"] != true {
		t.Fatalf("identical resolved ClaimBatch = %#v, %v", responses, err)
	}
}

func TestConcurrentDuplicateBatchClaimsOnlyOneSucceeds(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	for _, callID := range []string{"call-1", "call-2"} {
		if err := pending.Register(t.Context(), scope, callID, "confirm_booking", jsontext.Value(`{"trip":"one"}`)); err != nil {
			t.Fatal(err)
		}
	}
	submitted := []agui.PendingToolResult{
		{CallID: "call-1", Payload: jsontext.Value(`{"approved":true}`)},
		{CallID: "call-2", Payload: jsontext.Value(`{"approved":false}`)},
	}
	start := make(chan struct{})
	errorsByAttempt := make(chan error, 2)
	var group sync.WaitGroup
	for range 2 {
		group.Go(func() {
			<-start
			_, err := pending.ClaimBatch(t.Context(), auth.Identity{UserID: scope.UserID}, scope, submitted)
			errorsByAttempt <- err
		})
	}
	close(start)
	group.Wait()
	close(errorsByAttempt)
	successes, rejected := 0, 0
	for err := range errorsByAttempt {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, agui.ErrPendingToolNotFound):
			rejected++
		default:
			t.Fatalf("unexpected ClaimBatch error: %v", err)
		}
	}
	if successes != 1 || rejected != 1 {
		t.Fatalf("concurrent batch outcomes: successes=%d rejected=%d", successes, rejected)
	}
}

type pendingRecord struct {
	app, user, thread, call, name, args, result, status string
	expires                                             int64
}
type pendingFixture struct {
	d1      *D1
	mu      sync.Mutex
	records map[string]pendingRecord
}

func newPendingFixture(t *testing.T) *pendingFixture {
	t.Helper()
	fixture := &pendingFixture{records: map[string]pendingRecord{}}
	client := &http.Client{Transport: fixture}
	d1, err := NewD1(config.Cloudflare{AccountID: "account", APIToken: "token", D1DatabaseID: "database"}, client)
	if err != nil {
		t.Fatal(err)
	}
	fixture.d1 = d1
	return fixture
}

func (f *pendingFixture) RoundTrip(request *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	f.handle(recorder, request)
	return recorder.Result(), nil
}

type batchEnvelope struct {
	Batch []Statement `json:"batch"`
}

func (f *pendingFixture) handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var env batchEnvelope
	if json.UnmarshalRead(r.Body, &env) != nil || len(env.Batch) == 0 {
		http.Error(w, "bad request", 400)
		return
	}
	statements := env.Batch
	f.mu.Lock()
	defer f.mu.Unlock()
	results := make([]map[string]any, len(statements))
	for index, statement := range statements {
		rows := []map[string]any{}
		changes := int64(0)
		sql := strings.TrimSpace(statement.SQL)
		switch {
		case strings.HasPrefix(sql, "WITH incoming") && strings.Contains(sql, "INSERT INTO pending_client_tools"):
			count := int(statement.Params[len(statement.Params)-1].(float64))
			incoming := make([]pendingRecord, 0, count)
			compatible := true
			for callIndex := range count {
				offset := callIndex * 8
				record := pendingRecord{
					app: textParam(statement.Params[offset]), user: textParam(statement.Params[offset+1]), thread: textParam(statement.Params[offset+2]),
					call: textParam(statement.Params[offset+3]), name: textParam(statement.Params[offset+4]), args: textParam(statement.Params[offset+5]),
					status: "pending", expires: int64(statement.Params[offset+7].(float64)),
				}
				incoming = append(incoming, record)
				if existing, ok := f.records[recordKey(record.app, record.user, record.thread, record.call)]; ok && (existing.name != record.name || existing.args != record.args || existing.status != "pending") {
					compatible = false
				}
			}
			if compatible {
				for _, record := range incoming {
					key := recordKey(record.app, record.user, record.thread, record.call)
					if _, exists := f.records[key]; !exists {
						f.records[key] = record
						changes++
					}
				}
			}
		case strings.HasPrefix(sql, "INSERT INTO pending_client_tools"):
			key := recordKey(textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]))
			f.records[key] = pendingRecord{app: textParam(statement.Params[0]), user: textParam(statement.Params[1]), thread: textParam(statement.Params[2]), call: textParam(statement.Params[3]), name: textParam(statement.Params[4]), args: textParam(statement.Params[5]), status: "pending", expires: int64(statement.Params[7].(float64))}
			changes = 1
		case strings.HasPrefix(sql, "UPDATE pending_client_tools"):
			key := recordKey(textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]), textParam(statement.Params[4]))
			record, ok := f.records[key]
			now := int64(statement.Params[5].(float64))
			if ok && record.status == "pending" && record.expires > now {
				record.result = textParam(statement.Params[0])
				record.status = "resolved"
				f.records[key] = record
				changes = 1
			}
		case strings.HasPrefix(sql, "SELECT status, result_json"):
			key := recordKey(textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]))
			record, ok := f.records[key]
			now := int64(statement.Params[4].(float64))
			if ok && (record.status == "pending" || record.status == "resolved") && record.expires > now {
				rows = append(rows, map[string]any{"status": record.status, "result_json": record.result})
			}
		case strings.HasPrefix(sql, "SELECT tool_name"):
			key := recordKey(textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]))
			record, ok := f.records[key]
			now := int64(statement.Params[4].(float64))
			if ok && record.status == "resolved" && record.expires > now {
				rows = append(rows, map[string]any{"tool_name": record.name, "args_json": record.args, "result_json": record.result})
			}
		case strings.HasPrefix(sql, "SELECT call_id, tool_name, args_json, status"):
			app, user, thread := textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2])
			for _, value := range statement.Params[3:] {
				callID := textParam(value)
				if record, ok := f.records[recordKey(app, user, thread, callID)]; ok {
					rows = append(rows, map[string]any{"call_id": record.call, "tool_name": record.name, "args_json": record.args, "status": record.status})
				}
			}
		case strings.HasPrefix(sql, "DELETE FROM pending_client_tools") && strings.Contains(sql, "RETURNING call_id"):
			app, user, thread := textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2])
			now := int64(statement.Params[3].(float64))
			countIndex := 4
			for countIndex < len(statement.Params) {
				if _, ok := statement.Params[countIndex].(float64); ok {
					break
				}
				countIndex++
			}
			count := int(statement.Params[countIndex].(float64))
			callIDs := make([]string, count)
			payloads := make(map[string]string, count)
			for callIndex := range count {
				callIDs[callIndex] = textParam(statement.Params[4+callIndex])
				conditionIndex := 4 + count + callIndex*2
				payloads[textParam(statement.Params[conditionIndex])] = textParam(statement.Params[conditionIndex+1])
			}
			valid := true
			for _, callID := range callIDs {
				record, ok := f.records[recordKey(app, user, thread, callID)]
				if !ok || record.expires <= now || (record.status != "pending" && (record.status != "resolved" || record.result != payloads[callID])) {
					valid = false
					break
				}
			}
			if valid {
				for _, callID := range callIDs {
					key := recordKey(app, user, thread, callID)
					record := f.records[key]
					rows = append(rows, map[string]any{"call_id": record.call, "tool_name": record.name, "args_json": record.args, "result_json": record.result, "status": record.status})
					delete(f.records, key)
					changes++
				}
			}
		case strings.HasPrefix(sql, "DELETE FROM pending_client_tools") && strings.Contains(sql, "call_id"):
			key := recordKey(textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]))
			record, ok := f.records[key]
			now := int64(statement.Params[4].(float64))
			if ok && record.status == "resolved" && record.expires > now {
				delete(f.records, key)
				changes = 1
			}
		case strings.HasPrefix(sql, "DELETE FROM pending_client_tools"):
			now := int64(statement.Params[0].(float64))
			for key, record := range f.records {
				if record.expires <= now {
					delete(f.records, key)
					changes++
				}
			}
		}
		results[index] = map[string]any{"success": true, "results": rows, "meta": map[string]any{"changes": changes}}
	}
	_ = json.MarshalWrite(w, map[string]any{"success": true, "result": results})
}

func recordKey(app, user, thread, call string) string {
	return strings.Join([]string{app, user, thread, call}, "\x00")
}
func textParam(value any) string { text, _ := value.(string); return text }
