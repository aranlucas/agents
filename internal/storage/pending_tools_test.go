package storage

import (
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agui"
	"github.com/aranlucas/agents/internal/auth"
)

func TestClientToolResultCannotResolveOrResumeAnotherUsersCall(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
	scope := agui.ToolScope{AppName: "oralboards", UserID: "user-a", ThreadID: "thread-a"}
	if err := pending.Register(t.Context(), scope, "call\n1", "ask_question", nil); err == nil {
		t.Fatal("Register() with control character in call ID should fail")
	}
}

func TestRegisterBatchConflictLeavesEveryNewCallUnregistered(t *testing.T) {
	store := newPendingFixture(t)
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	if store.registered(t, scope, "call-new") {
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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
	pending := NewPendingStore(store.db, func() time.Time { return now })
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

type pendingFixture struct {
	db *DB
}

func newPendingFixture(t *testing.T) *pendingFixture {
	t.Helper()
	return &pendingFixture{db: newTestDB(t)}
}

func (f *pendingFixture) registered(t *testing.T, scope agui.ToolScope, callID string) bool {
	t.Helper()
	var count int
	err := f.db.SQL().QueryRowContext(t.Context(), `SELECT COUNT(*) FROM pending_client_tools WHERE app_name = ? AND user_id = ? AND thread_id = ? AND call_id = ?`,
		scope.AppName, scope.UserID, scope.ThreadID, callID).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	return count > 0
}
