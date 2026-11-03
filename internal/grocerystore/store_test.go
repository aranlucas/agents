package grocerystore

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
)

// scriptedRunner supplies database rows for decoding and failure-path tests.
type scriptedRunner func([]storage.Statement) []storage.Result

func (respond scriptedRunner) Run(_ context.Context, statements ...storage.Statement) ([]storage.Result, error) {
	return respond(statements), nil
}

func TestListHouseholdsDecodesMembershipRole(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		return []storage.Result{queryResult(t, Household{ID: "hh_1", Name: "Home", Role: "member", CreatedBy: "user_2", CreatedAt: 1000})}
	})

	households, err := store.ListHouseholds(t.Context(), "user_1")
	if err != nil || len(households) != 1 || households[0].Role != "member" {
		t.Fatalf("households/error = %#v / %v", households, err)
	}
}

func TestJoinHouseholdRejectsExpiredInviteBeforeMutation(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		if requests > 1 {
			t.Fatal("expired invite attempted a mutation")
		}
		return []storage.Result{queryResult(t, map[string]any{
			"id": "hh_1", "name": "Home", "created_by": "user_1", "created_at": 100,
			"expires_at": 999, "max_uses": 5, "used_count": 0, "already_member": 0,
		})}
	})

	_, err := store.JoinHousehold(t.Context(), "user_2", "ABCDEFGH", time.UnixMilli(1000))
	if !errors.Is(err, ErrInviteExpired) {
		t.Fatalf("error = %v", err)
	}
}

func newFixtureStore(t *testing.T, respond func([]storage.Statement) []storage.Result) *Store {
	t.Helper()
	return NewStore(scriptedRunner(respond))
}

func mutationResult(changes int64) storage.Result {
	result := storage.Result{Success: true}
	result.Meta.Changes = changes
	return result
}

func queryResult(t *testing.T, rows ...any) storage.Result {
	t.Helper()
	result := storage.Result{Success: true}
	for _, row := range rows {
		encoded, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		result.Rows = append(result.Rows, encoded)
	}
	return result
}
