package agui

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

	"github.com/aranlucas/agents/agents/internal/auth"
	"github.com/aranlucas/agents/agents/internal/cloudflare"
	"github.com/aranlucas/agents/agents/internal/config"
	"google.golang.org/genai"
)

func TestClientToolResultCannotResolveOrResumeAnotherUsersCall(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(context.Background(), scope, "call-1", "confirm_booking", map[string]any{"flight": "one"}); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1", map[string]any{"approved": true}); !errors.Is(err, ErrPendingToolNotFound) {
		t.Fatalf("cross-user Resolve() error = %v", err)
	}
	if _, err := pending.Take(context.Background(), auth.Identity{UserID: "user-b"}, "travel", "thread-a", "call-1"); !errors.Is(err, ErrPendingToolNotFound) {
		t.Fatalf("cross-user Take() error = %v", err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", map[string]any{"approved": true}); err != nil {
		t.Fatal(err)
	}
	response, err := pending.Take(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1")
	if err != nil || response.Name != "confirm_booking" || response.ID != "call-1" || response.Response["approved"] != true {
		t.Fatalf("Take() = %#v, %v", response, err)
	}
	if _, err := pending.Take(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1"); !errors.Is(err, ErrPendingToolNotFound) {
		t.Fatalf("replayed Take() error = %v", err)
	}
}

func TestApprovalResultResumesOnlyOriginalTravelThread(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	scope := ToolScope{AppName: "collab_trip_agent", UserID: "user-a", ThreadID: "travel-thread-a"}
	if err := pending.Register(context.Background(), scope, "approval-1", "request_user_approval", map[string]any{"action": "book_flight"}); err != nil {
		t.Fatal(err)
	}
	identity := auth.Identity{UserID: "user-a"}
	for _, other := range []struct{ app, thread string }{{"collab_trip_agent", "travel-thread-b"}, {"grocery_agent", "travel-thread-a"}} {
		if err := pending.Resolve(context.Background(), identity, other.app, other.thread, "approval-1", map[string]any{"approved": true}); !errors.Is(err, ErrPendingToolNotFound) {
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

func TestClientToolsetPreservesDynamicSchemaAndLongRunningMarker(t *testing.T) {
	store := newPendingFixture(t)
	toolset, err := NewClientToolset([]ClientTool{{Name: "choose_flight", Description: "Choose a flight", Parameters: map[string]any{
		"type": "object", "properties": map[string]any{"flight_id": map[string]any{"type": "string"}}, "required": []string{"flight_id"},
	}}}, NewPendingStore(store.d1, time.Now))
	if err != nil {
		t.Fatal(err)
	}
	tools, err := toolset.Tools(nil)
	if err != nil || len(tools) != 1 {
		t.Fatalf("Tools() = %#v, %v", tools, err)
	}
	if !tools[0].IsLongRunning() || tools[0].Name() != "choose_flight" {
		t.Fatalf("tool = %#v", tools[0])
	}
	declarer, ok := tools[0].(interface {
		Declaration() *genai.FunctionDeclaration
	})
	if !ok {
		t.Fatal("tool has no declaration")
	}
	encoded, _ := json.Marshal(declarer.Declaration().ParametersJsonSchema)
	if !strings.Contains(string(encoded), "flight_id") {
		t.Fatalf("schema = %s", encoded)
	}
	if _, err := NewClientToolset([]ClientTool{{Name: "choose_flight"}, {Name: "choose_flight"}}, NewPendingStore(store.d1, time.Now)); err == nil {
		t.Fatal("duplicate tool accepted")
	}
}

func TestPendingToolExpiryAndPublicIdentityFailClosed(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.d1, func() time.Time { return now })
	if err := pending.Register(context.Background(), ToolScope{AppName: "travel", UserID: "user-a", ThreadID: "thread-a"}, "call-1", "approve", nil); err != nil {
		t.Fatal(err)
	}
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "anonymous", Public: true}, "travel", "thread-a", "call-1", true); !errors.Is(err, ErrPendingToolNotFound) {
		t.Fatalf("public Resolve() = %v", err)
	}
	now = now.Add(pendingToolTTL + time.Second)
	if err := pending.Resolve(context.Background(), auth.Identity{UserID: "user-a"}, "travel", "thread-a", "call-1", true); !errors.Is(err, ErrPendingToolNotFound) {
		t.Fatalf("expired Resolve() = %v", err)
	}
}

type pendingRecord struct {
	app, user, thread, call, name, args, result, status string
	expires                                             int64
}
type pendingFixture struct {
	d1      *cloudflare.D1
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
	d1, err := cloudflare.NewD1(config.Cloudflare{AccountID: "account", APIToken: "token", D1DatabaseID: "database"}, client)
	if err != nil {
		t.Fatal(err)
	}
	fixture.d1 = d1
	return fixture
}

type batchEnvelope struct {
	Batch []cloudflare.Statement `json:"batch"`
}

func (f *pendingFixture) handle(w http.ResponseWriter, r *http.Request) {
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
