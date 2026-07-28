package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agents/internal/auth"
	"agents/internal/groceries"
	"agents/internal/groceryapi"
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
	if repository.authorizationCalls != 1 {
		t.Fatalf("authorization calls = %d", repository.authorizationCalls)
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

func TestGroceryAPICreateListAllowsOmittedDefaultableQuantity(t *testing.T) {
	repository := &fakeGroceryRepository{}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/lists", `{"title":"Weekend","items":[{"name":"Milk"}]}`, true)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if len(repository.savedList.Items) != 1 || repository.savedList.Items[0].Quantity != "" {
		t.Fatalf("saved items = %#v", repository.savedList.Items)
	}
}

func TestGroceryAPIAddItemsAllowsOmittedDefaultableQuantity(t *testing.T) {
	repository := &fakeGroceryRepository{canAccessList: true}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/lists/list_1/items", `{"items":[{"name":"Milk"}]}`, true)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if len(repository.addedItems) != 1 || repository.addedItems[0].Quantity != "" {
		t.Fatalf("added items = %#v", repository.addedItems)
	}
	if repository.authorizationCalls != 1 {
		t.Fatalf("authorization calls = %d", repository.authorizationCalls)
	}
}

func TestGroceryAPICreateInvitePreauthorizationRunsOnce(t *testing.T) {
	repository := &fakeGroceryRepository{owner: true}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/households/hh_1/invites", `{}`, true)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if repository.authorizationCalls != 1 {
		t.Fatalf("authorization calls = %d", repository.authorizationCalls)
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

func TestGroceryAPIRejectsInvalidJSONBeforeDataAccess(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "unknown field", body: `{"name":"Home","unexpected":true}`},
		{name: "trailing document", body: `{"name":"Home"} {}`},
		{name: "malformed document", body: `{"name":`},
		{name: "body too large", body: `{"name":"` + strings.Repeat("a", maxGroceryAPIRequestBody) + `"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repository := &fakeGroceryRepository{}
			recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/households", test.body, true)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			var response groceryapi.Error
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response.Error != "invalid_grocery_request" {
				t.Fatalf("error = %q", response.Error)
			}
			if repository.dataCalls != 0 {
				t.Fatalf("data calls = %d", repository.dataCalls)
			}
		})
	}
}

func TestGroceryAPIPreauthorizesProtectedMutationsBeforeBodyValidation(t *testing.T) {
	routes := []struct {
		name   string
		method string
		path   string
	}{
		{name: "create invite", method: http.MethodPost, path: "/api/grocery/households/hh_1/invites"},
		{name: "add items", method: http.MethodPost, path: "/api/grocery/lists/list_1/items"},
		{name: "update item", method: http.MethodPatch, path: "/api/grocery/lists/list_1/items/item_1"},
	}
	bodies := []struct {
		name string
		body string
	}{
		{name: "malformed", body: `{"invalid":`},
		{name: "unknown field", body: `{"unexpected":true}`},
		{name: "oversized", body: `{"value":"` + strings.Repeat("a", maxGroceryAPIRequestBody) + `"}`},
	}
	for _, route := range routes {
		for _, body := range bodies {
			t.Run(route.name+"/"+body.name, func(t *testing.T) {
				repository := &fakeGroceryRepository{}
				recorder := serveGroceryAPI(t, repository, route.method, route.path, body.body, true)
				if recorder.Code != http.StatusForbidden || !strings.Contains(recorder.Body.String(), "grocery_forbidden") {
					t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
				}
				if repository.authorizationCalls != 1 {
					t.Fatalf("authorization calls = %d", repository.authorizationCalls)
				}
				if repository.dataCalls != 0 {
					t.Fatalf("data calls = %d", repository.dataCalls)
				}
			})
		}
	}
}

func TestGroceryAPIPreservesJSONWithoutContentType(t *testing.T) {
	repository := &fakeGroceryRepository{}
	recorder := serveGroceryAPI(t, repository, http.MethodPost, "/api/grocery/households", `{"name":"Home"}`, true)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if repository.dataCalls != 1 {
		t.Fatalf("data calls = %d", repository.dataCalls)
	}
}

func TestGroceryAPIShoppingRoutesFailSafelyWithoutRepository(t *testing.T) {
	recorder := serveGroceryAPI(t, &fakeGroceryRepository{}, http.MethodGet, "/api/grocery/pantry", "", true)
	if recorder.Code != http.StatusServiceUnavailable || !strings.Contains(recorder.Body.String(), "grocery_api_unavailable") {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestGroceryStrictMethodReturnsTypedResponse(t *testing.T) {
	repository := &fakeGroceryRepository{joinError: groceries.ErrInviteExpired}
	api := &groceryAPI{repository: repository, now: func() time.Time { return time.UnixMilli(2000) }}
	response, err := api.JoinHousehold(verifiedGroceryContext(t), groceryapi.JoinHouseholdRequestObject{Code: "ABCDEFGH"})
	if err != nil {
		t.Fatal(err)
	}
	typed, ok := response.(groceryapi.JoinHouseholddefaultJSONResponse)
	if !ok {
		t.Fatalf("response type = %T", response)
	}
	if typed.StatusCode != http.StatusGone || typed.Body.Error != "grocery_invite_expired" {
		t.Fatalf("response = %#v", typed)
	}
}

func TestGroceryErrorResponse(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{name: "invalid", err: groceries.ErrInvalid, status: http.StatusBadRequest, code: "invalid_grocery_request"},
		{name: "forbidden", err: groceries.ErrForbidden, status: http.StatusForbidden, code: "grocery_forbidden"},
		{name: "not found", err: groceries.ErrNotFound, status: http.StatusNotFound, code: "grocery_not_found"},
		{name: "invite expired", err: groceries.ErrInviteExpired, status: http.StatusGone, code: "grocery_invite_expired"},
		{name: "invite exhausted", err: groceries.ErrInviteExhausted, status: http.StatusConflict, code: "grocery_invite_exhausted"},
		{name: "unavailable", err: errors.New("backend unavailable"), status: http.StatusServiceUnavailable, code: "grocery_api_unavailable"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			status, response := groceryErrorResponse(test.err)
			if status != test.status || response.Error != test.code {
				t.Fatalf("response = %d %#v", status, response)
			}
		})
	}
}

func serveGroceryAPI(t *testing.T, repository groceries.LibraryRepository, method, path, body string, authenticated bool) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	if err := registerGroceryAPI(mux, repository, nil, func() time.Time { return time.UnixMilli(2000) }); err != nil {
		t.Fatalf("register grocery API: %v", err)
	}
	handler := auth.RequireIdentity(nil, mux, acceptingVerifier{})
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if authenticated {
		request.Header.Set("Authorization", "Bearer test")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func verifiedGroceryContext(t *testing.T) context.Context {
	t.Helper()
	var verified context.Context
	handler := auth.RequireIdentity(nil, http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		verified = request.Context()
	}), acceptingVerifier{})
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer test")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if verified == nil {
		t.Fatal("identity context was not installed")
	}
	return verified
}

type fakeGroceryRepository struct {
	groceries.LibraryRepository
	member             bool
	owner              bool
	canAccessList      bool
	authorizationCalls int
	dataCalls          int
	joinError          error
	updatedBy          string
	updatedPatch       groceries.ItemPatch
	addedItems         []groceries.NewItem
	savedListBy        string
	savedList          groceries.SavedListInput
	listRecipeCalls    int
	authorizedUser     string
	createdInviteBy    string
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
	f.authorizationCalls++
	return f.member, nil
}

func (f *fakeGroceryRepository) IsOwner(_ context.Context, userID, _ string) (bool, error) {
	f.authorizationCalls++
	f.authorizedUser = userID
	return f.owner, nil
}

func (f *fakeGroceryRepository) CreateInvite(_ context.Context, userID, _, _ string, _ int, _ time.Time) (groceries.Invite, error) {
	f.dataCalls++
	f.createdInviteBy = userID
	return groceries.Invite{}, nil
}

func (f *fakeGroceryRepository) JoinHousehold(context.Context, string, string, time.Time) (groceries.Household, error) {
	f.dataCalls++
	return groceries.Household{}, f.joinError
}

func (f *fakeGroceryRepository) CanAccessList(context.Context, string, string) (bool, error) {
	f.authorizationCalls++
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

func (f *fakeGroceryRepository) AddItems(_ context.Context, _ string, _ string, items []groceries.NewItem, _ time.Time) ([]groceries.Item, error) {
	f.dataCalls++
	f.addedItems = items
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
