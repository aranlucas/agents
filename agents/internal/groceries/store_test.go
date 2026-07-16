package groceries

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agents/internal/cloudflare"
	"agents/internal/config"
)

type d1Batch struct {
	Batch []cloudflare.Statement `json:"batch"`
}

func TestCreateHouseholdWritesOwnerMembershipInOneD1Batch(t *testing.T) {
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 2 || !strings.Contains(statements[0].SQL, "INSERT INTO households") || !strings.Contains(statements[1].SQL, "'owner'") {
			t.Fatalf("statements = %#v", statements)
		}
		return []cloudflare.Result{mutationResult(1), mutationResult(1)}
	})
	store.newID = func(string) (string, error) { return "hh_1", nil }

	household, err := store.CreateHousehold(t.Context(), "user_1", "Home", time.UnixMilli(1000))
	if err != nil || household.ID != "hh_1" || household.Role != "owner" || household.CreatedAt != 1000 {
		t.Fatalf("household/error = %#v / %v", household, err)
	}
}

func TestListHouseholdsDecodesMembershipRole(t *testing.T) {
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 1 || statements[0].Params[0] != "user_1" {
			t.Fatalf("statements = %#v", statements)
		}
		return []cloudflare.Result{queryResult(t, Household{ID: "hh_1", Name: "Home", Role: "member", CreatedBy: "user_2", CreatedAt: 1000})}
	})

	households, err := store.ListHouseholds(t.Context(), "user_1")
	if err != nil || len(households) != 1 || households[0].Role != "member" {
		t.Fatalf("households/error = %#v / %v", households, err)
	}
}

func TestJoinHouseholdRejectsExpiredInviteBeforeMutation(t *testing.T) {
	requests := 0
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		requests++
		if requests > 1 {
			t.Fatal("expired invite attempted a mutation")
		}
		return []cloudflare.Result{queryResult(t, map[string]any{
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
	store := newFixtureStore(t, func(statements []cloudflare.Statement) []cloudflare.Result {
		if len(statements) != 3 || !strings.Contains(statements[0].SQL, "checked_by = ?") {
			t.Fatalf("statements = %#v", statements)
		}
		params := statements[0].Params
		if params[0] != "user_2" || int64(params[1].(float64)) != now.UnixMilli() {
			t.Fatalf("update params = %#v", params)
		}
		checkedBy := "user_2"
		checkedAt := now.UnixMilli()
		return []cloudflare.Result{
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

func newFixtureStore(t *testing.T, respond func([]cloudflare.Statement) []cloudflare.Result) *Store {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var envelope d1Batch
		if err := json.NewDecoder(r.Body).Decode(&envelope); err != nil {
			t.Fatal(err)
		}
		results := respond(envelope.Batch)
		payload := make([]map[string]any, len(results))
		for index, result := range results {
			rows := make([]any, len(result.Rows))
			for rowIndex, raw := range result.Rows {
				var row any
				if err := json.Unmarshal(raw, &row); err != nil {
					t.Fatal(err)
				}
				rows[rowIndex] = row
			}
			payload[index] = map[string]any{"success": true, "results": rows, "meta": map[string]any{"changes": result.Meta.Changes}}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": payload})
	}))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Transport = groceryRewriteTransport{target: server.URL, base: client.Transport}
	d1, err := cloudflare.NewD1(config.Cloudflare{AccountID: "account", APIToken: "token", D1DatabaseID: "database"}, client)
	if err != nil {
		t.Fatal(err)
	}
	return NewStore(d1)
}

type groceryRewriteTransport struct {
	target string
	base   http.RoundTripper
}

func (r groceryRewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	parsed, _ := clone.URL.Parse(r.target)
	clone.URL = parsed
	return r.base.RoundTrip(clone)
}

func mutationResult(changes int64) cloudflare.Result {
	result := cloudflare.Result{Success: true}
	result.Meta.Changes = changes
	return result
}

func queryResult(t *testing.T, rows ...any) cloudflare.Result {
	t.Helper()
	result := cloudflare.Result{Success: true}
	for _, row := range rows {
		encoded, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		result.Rows = append(result.Rows, encoded)
	}
	return result
}
