package groceries

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
)

// scriptedRunner answers each batch with a test-provided function. Statements
// are round-tripped through JSON so assertions see wire-shaped parameters
// (numbers as float64), independent of the Go types the store passed.
type scriptedRunner func([]storage.Statement) []storage.Result

func (respond scriptedRunner) Run(_ context.Context, statements ...storage.Statement) ([]storage.Result, error) {
	encoded, err := json.Marshal(statements)
	if err != nil {
		return nil, err
	}
	var decoded []storage.Statement
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return nil, err
	}
	return respond(decoded), nil
}

func TestCreateHouseholdWritesOwnerMembershipInOneD1Batch(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 2 || !strings.Contains(statements[0].SQL, "INSERT INTO households") || !strings.Contains(statements[1].SQL, "'owner'") {
			t.Fatalf("statements = %#v", statements)
		}
		return []storage.Result{mutationResult(1), mutationResult(1)}
	})
	store.newID = func(string) (string, error) { return "hh_1", nil }

	household, err := store.CreateHousehold(t.Context(), "user_1", "Home", time.UnixMilli(1000))
	if err != nil || household.ID != "hh_1" || household.Role != "owner" || household.CreatedAt != 1000 {
		t.Fatalf("household/error = %#v / %v", household, err)
	}
}

func TestListHouseholdsDecodesMembershipRole(t *testing.T) {
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		if len(statements) != 1 || statements[0].Params[0] != "user_1" {
			t.Fatalf("statements = %#v", statements)
		}
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

func TestUpdateItemAttributesCheckOffToCaller(t *testing.T) {
	now := time.UnixMilli(2000)
	requests := 0
	store := newFixtureStore(t, func(statements []storage.Statement) []storage.Result {
		requests++
		if requests == 2 {
			return []storage.Result{
				queryResult(t, List{ID: "list_1", OwnerUserID: "user_1", Title: "Groceries", Status: "active", CreatedAt: 1_000, UpdatedAt: 2_000}),
				queryResult(t),
			}
		}
		if len(statements) != 3 || !strings.Contains(statements[0].SQL, "checked_by = ?") {
			t.Fatalf("statements = %#v", statements)
		}
		params := statements[0].Params
		if params[0] != "user_2" || int64(params[1].(float64)) != now.UnixMilli() {
			t.Fatalf("update params = %#v", params)
		}
		checkedBy := "user_2"
		checkedAt := now.UnixMilli()
		return []storage.Result{
			mutationResult(1),
			queryResult(t, Item{ID: "item_1", ListID: "list_1", Name: "Milk", Quantity: "1", AddedBy: "user_1", CheckedBy: &checkedBy, CheckedAt: &checkedAt, UpdatedAt: checkedAt}),
			mutationResult(1),
		}
	})
	checked := true

	item, err := store.UpdateItem(t.Context(), "user_2", "list_1", "item_1", ItemPatch{Checked: &checked}, now)
	if err != nil || item.CheckedBy == nil || *item.CheckedBy != "user_2" || item.CheckedAt == nil || *item.CheckedAt != 2000 {
		t.Fatalf("item/error = %#v / %v", item, err)
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
