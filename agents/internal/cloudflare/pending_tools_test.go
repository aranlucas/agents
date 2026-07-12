package cloudflare

import (
	"context"
	"encoding/json"
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
	if err := pending.Register(context.Background(), scope, "call-1", "confirm_booking", map[string]any{"flight": "one"}); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1", map[string]any{"approved": true}); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("cross-user Resolve() error = %v", err)
	}
	if _, err := pending.Take(context.Background(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1"); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("cross-user Take() error = %v", err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", map[string]any{"approved": true}); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1")
	if err != nil || response.Name != "confirm_booking" || response.ID != "call-1" || response.Response["approved"] != true {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
	if _, err := pending.Take(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1"); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("replayed Take() error = %v", err)
	}
}

func TestApprovalResultResumesOnlyOriginalTravelThread(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "collab_trip_agent", UserID: "user-a", ThreadID: "travel-thread-a"}
	if err := pending.Register(context.Background(), scope, "approval-1", "request_user_approval", map[string]any{"action": "book_flight"}); err != nil {
		t.Fatal(err)
	}
	identity := auth.Identity{UserID: "user-a"}
	for _, other := range []struct{ app, thread string }{{"collab_trip_agent", "travel-thread-b"}, {"grocery_agent", "travel-thread-a"}} {
		if err := pending.Resolve(context.Background(), identity, other.app, other.thread, "approval-1", map[string]any{"approved": true}); !errors.Is(err, agui.ErrPendingToolNotFound) {
			t.Fatalf("cross-scope resolve %s/%s = %v", other.app, other.thread, err)
		}
	}
	if err := pending.Resolve(context.Background(), identity, scope.AppName, scope.ThreadID, "approval-1", map[string]any{"approved": true}); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(context.Background(), identity, scope.AppName, scope.ThreadID, "approval-1")
	if err != nil {
		t.Fatal(err)
	}
	request, _ := response.Response["_agui_request"].(map[string]any)
	if response.Name != "request_user_approval" || response.Response["approved"] != true || request["action"] != "book_flight" {
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
	if err := pending.Register(context.Background(), scope, "0", "ask_question", map[string]any{"question": "..."}); err != nil {
		t.Fatalf("Register() with numeric call ID = %v", err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-a"}, "oralboards", "thread-a", "0", map[string]any{"answer": "..."}); err != nil {
		t.Fatalf("Resolve() with numeric call ID = %v", err)
	}
	response, err := pending.Take(context.Background(), auth.Identity{UserID: "user-a"}, "oralboards", "thread-a", "0")
	if err != nil || response.ID != "0" {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
}

func TestRegisterRejectsControlCharacterCallID(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "oralboards", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(context.Background(), scope, "call\n1", "ask_question", nil); err == nil {
		t.Fatal("Register() with control character in call ID should fail")
	}
}

func TestPendingToolExpiryAndPublicIdentityFailClosed(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	if err := pending.Register(context.Background(), agui.ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}, "call-1", "approve", nil); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "anonymous", Public: true}, "travel", "thread-a", "call-1", true); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("public Resolve() = %v", err)
	}
	now = now.Add(pendingToolTTL + time.Second)
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", true); !errors.Is(err, agui.ErrPendingToolNotFound) {
		t.Fatalf("expired Resolve() = %v", err)
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
	server := httptest.NewServer(http.HandlerFunc(fixture.handle))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Transport = pendingRewriteTransport{target: server.URL, base: client.Transport}
	d1, err := NewD1(config.Cloudflare{AccountID: "account", APIToken: "token", D1DatabaseID: "database"}, client)
	if err != nil {
		t.Fatal(err)
	}
	fixture.d1 = d1
	return fixture
}

type batchEnvelope struct {
	Batch []Statement `json:"batch"`
}

func (f *pendingFixture) handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var env batchEnvelope
	if json.NewDecoder(r.Body).Decode(&env) != nil || len(env.Batch) == 0 {
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
		case strings.HasPrefix(sql, "SELECT tool_name"):
			key := recordKey(textParam(statement.Params[0]), textParam(statement.Params[1]), textParam(statement.Params[2]), textParam(statement.Params[3]))
			record, ok := f.records[key]
			now := int64(statement.Params[4].(float64))
			if ok && record.status == "resolved" && record.expires > now {
				rows = append(rows, map[string]any{"tool_name": record.name, "args_json": record.args, "result_json": record.result})
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
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": results})
}

func recordKey(app, user, thread, call string) string {
	return strings.Join([]string{app, user, thread, call}, "\x00")
}
func textParam(value any) string { text, _ := value.(string); return text }

type pendingRewriteTransport struct {
	target string
	base   http.RoundTripper
}

func (p pendingRewriteTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	parsed, _ := clone.URL.Parse(p.target)
	clone.URL = parsed
	return p.base.RoundTrip(clone)
}
