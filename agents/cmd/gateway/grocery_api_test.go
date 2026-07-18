package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agents/internal/auth"
	"agents/internal/groceries"
)

func TestGroceryAPIAuthorizationRejectsNonMembersBeforeDataAccess(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "owner invite", method: http.MethodPost, path: "/api/grocery/households/hh_1/invites", body: `{}`},
		{name: "household lists", method: http.MethodGet, path: "/api/grocery/lists?householdId=hh_1"},
		{name: "create household list", method: http.MethodPost, path: "/api/grocery/lists", body: `{"household_id":"hh_1","title":"Weekly"}`},
		{name: "get list", method: http.MethodGet, path: "/api/grocery/lists/list_1"},
		{name: "add item", method: http.MethodPost, path: "/api/grocery/lists/list_1/items", body: `{"items":[{"name":"Milk","quantity":"1"}]}`},
		{name: "update item", method: http.MethodPatch, path: "/api/grocery/lists/list_1/items/item_1", body: `{"checked":true}`},
		{name: "delete item", method: http.MethodDelete, path: "/api/grocery/lists/list_1/items/item_1"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repository := &fakeGroceryRepository{}
			recorder := serveGroceryAPI(t, repository, test.method, test.path, test.body, true)
			if recorder.Code != http.StatusForbidden {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			if repository.dataCalls != 0 {
				t.Fatalf("protected data calls = %d", repository.dataCalls)
			}
		})
	}
}

func TestGroceryAPIRequiresClerkIdentity(t *testing.T) {
	recorder := serveGroceryAPI(t, &fakeGroceryRepository{}, http.MethodGet, "/api/grocery/households", "", false)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGroceryAPIReportsExpiredInvite(t *testing.T) {
	repository := &fakeGroceryRepository{joinError: groceries.ErrInviteExpired}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/invites/ABCDEFGH/join", "", true)
	if recorder.Code != http.StatusGone || !strings.Contains(recorder.Body.String(), "grocery_invite_expired") {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGroceryAPICheckOffUsesVerifiedCaller(t *testing.T) {
	repository := &fakeGroceryRepository{canAccessList: true}
	recorder := serveGroceryAPI(t, repository, http.MethodPatch, "/api/grocery/lists/list_1/items/item_1", `{"checked":true}`, true)
	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if repository.updatedBy != "clerk-user" || repository.updatedPatch.Checked == nil || !*repository.updatedPatch.Checked {
		t.Fatalf("update = user %q patch %#v", repository.updatedBy, repository.updatedPatch)
	}
	var item groceries.Item
	if err := json.Unmarshal(recorder.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.CheckedBy == nil || *item.CheckedBy != "clerk-user" || item.CheckedAt == nil {
		t.Fatalf("item = %#v", item)
	}
}

func TestGroceryAPICreatesListsThroughLibraryRepository(t *testing.T) {
	repository := &fakeGroceryRepository{}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/lists", `{"title":"Weekend","items":[{"name":"Milk","quantity":"1 gal"}]}`, true)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if repository.savedListBy != "clerk-user" || repository.savedList.Title != "Weekend" || len(repository.savedList.Items) != 1 {
		t.Fatalf("saved list = user %q input %#v", repository.savedListBy, repository.savedList)
	}
}

func TestGroceryAPIAlwaysRegistersRecipeLibrary(t *testing.T) {
	repository := &fakeGroceryRepository{}
	recorder := serveGroceryAPI(t, repository, http.MethodGet, "/api/grocery/recipes", "", true)
	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if repository.listRecipeCalls != 1 {
		t.Fatalf("list recipe calls = %d", repository.listRecipeCalls)
	}
}

func serveGroceryAPI(t *testing.T, repository groceries.LibraryRepository, method, path, body string, authenticated bool) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	registerGroceryAPI(mux, repository, func() time.Time { return time.UnixMilli(2000) })
	handler := auth.RequireIdentity(nil, mux, acceptingVerifier{})
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if authenticated {
		request.Header.Set("Authorization", "Bearer test")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

type fakeGroceryRepository struct {
	groceries.LibraryRepository
	member          bool
	owner           bool
	canAccessList   bool
	dataCalls       int
	joinError       error
	updatedBy       string
	updatedPatch    groceries.ItemPatch
	savedListBy     string
	savedList       groceries.SavedListInput
	listRecipeCalls int
}

func (f *fakeGroceryRepository) CreateHousehold(context.Context, string, string, time.Time) (groceries.Household, error) {
	f.dataCalls++
	return groceries.Household{}, nil
}

func (f *fakeGroceryRepository) ListHouseholds(context.Context, string) ([]groceries.Household, error) {
	f.dataCalls++
	return []groceries.Household{}, nil
}

func (f *fakeGroceryRepository) IsMember(context.Context, string, string) (bool, error) {
	return f.member, nil
}

func (f *fakeGroceryRepository) IsOwner(context.Context, string, string) (bool, error) {
	return f.owner, nil
}

func (f *fakeGroceryRepository) CreateInvite(context.Context, string, string, string, int, time.Time) (groceries.Invite, error) {
	f.dataCalls++
	return groceries.Invite{}, nil
}

func (f *fakeGroceryRepository) JoinHousehold(context.Context, string, string, time.Time) (groceries.Household, error) {
	f.dataCalls++
	return groceries.Household{}, f.joinError
}

func (f *fakeGroceryRepository) CanAccessList(context.Context, string, string) (bool, error) {
	return f.canAccessList, nil
}

func (f *fakeGroceryRepository) ListLists(context.Context, string, string) ([]groceries.List, error) {
	f.dataCalls++
	return []groceries.List{}, nil
}

func (f *fakeGroceryRepository) GetList(context.Context, string, string) (groceries.List, error) {
	f.dataCalls++
	return groceries.List{}, nil
}

func (f *fakeGroceryRepository) AddItems(context.Context, string, string, []groceries.NewItem, time.Time) ([]groceries.Item, error) {
	f.dataCalls++
	return []groceries.Item{}, nil
}

func (f *fakeGroceryRepository) UpdateItem(_ context.Context, userID, listID, itemID string, patch groceries.ItemPatch, now time.Time) (groceries.Item, error) {
	f.dataCalls++
	f.updatedBy = userID
	f.updatedPatch = patch
	checkedAt := now.UnixMilli()
	return groceries.Item{ID: itemID, ListID: listID, Name: "Milk", Quantity: "1", AddedBy: "user_1", CheckedBy: &userID, CheckedAt: &checkedAt, UpdatedAt: checkedAt}, nil
}

func (f *fakeGroceryRepository) DeleteItem(context.Context, string, string, string, time.Time) error {
	f.dataCalls++
	return nil
}

func (f *fakeGroceryRepository) SaveList(_ context.Context, userID string, input groceries.SavedListInput, now time.Time) (groceries.List, error) {
	f.dataCalls++
	f.savedListBy = userID
	f.savedList = input
	return groceries.List{ID: "list_1", HouseholdID: input.HouseholdID, OwnerUserID: userID, Title: input.Title, Status: "active", CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli(), Items: []groceries.Item{}}, nil
}

func (f *fakeGroceryRepository) ListRecipes(context.Context, string, *string) ([]groceries.Recipe, error) {
	f.dataCalls++
	f.listRecipeCalls++
	return []groceries.Recipe{}, nil
}
