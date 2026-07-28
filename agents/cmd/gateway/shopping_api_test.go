package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/config"
	"agents/internal/groceries"
	"agents/internal/groceryapi"
	"google.golang.org/adk/v2/session"
)

func TestShoppingAPIRejectsAnonymous(t *testing.T) {
	api := newTestShoppingAPI(newFakeShoppingRepository())
	response, err := api.GetPantry(context.Background(), groceryapi.GetPantryRequestObject{})
	if err != nil {
		t.Fatal(err)
	}
	assertShoppingError(t, response, http.StatusUnauthorized, "unauthorized")
}

func TestPantryRoundTripThroughStrictMethods(t *testing.T) {
	repository := newFakeShoppingRepository()
	api := newTestShoppingAPI(repository)
	body := decodeShoppingBody[groceryapi.AddPantryItemsJSONRequestBody](t, `{"items":[{"name":"Milk","expires_at":3000}]}`)
	response, err := api.AddPantryItems(verifiedGroceryContext(t), groceryapi.AddPantryItemsRequestObject{Body: &body})
	if err != nil {
		t.Fatal(err)
	}
	added, ok := response.(groceryapi.AddPantryItems200JSONResponse)
	if !ok || len(added.Items) != 1 || added.Items[0].Quantity != 1 || added.Items[0].AddedAt != 2 {
		t.Fatalf("add response = %#v (%T)", response, response)
	}

	getResponse, err := api.GetPantry(verifiedGroceryContext(t), groceryapi.GetPantryRequestObject{})
	if err != nil {
		t.Fatal(err)
	}
	got, ok := getResponse.(groceryapi.GetPantry200JSONResponse)
	if !ok || len(got.Items) != 1 || got.Items[0].Name != "Milk" || got.Items[0].ExpiresAt == nil || *got.Items[0].ExpiresAt != 3000 {
		t.Fatalf("get response = %#v (%T)", getResponse, getResponse)
	}
}

func TestPreferredStoreNotFoundIs404(t *testing.T) {
	api := newTestShoppingAPI(newFakeShoppingRepository())
	response, err := api.GetPreferredStore(verifiedGroceryContext(t), groceryapi.GetPreferredStoreRequestObject{})
	if err != nil {
		t.Fatal(err)
	}
	assertShoppingError(t, response, http.StatusNotFound, "grocery_not_found")
}

func TestPreferredStoreUsesServerTimestamp(t *testing.T) {
	repository := newFakeShoppingRepository()
	api := newTestShoppingAPI(repository)
	body := decodeShoppingBody[groceryapi.SetPreferredStoreJSONRequestBody](t, `{
		"location_id":"store-1","name":"Market","address":"1 Main","chain":"Kroger","set_at":9999
	}`)
	response, err := api.SetPreferredStore(verifiedGroceryContext(t), groceryapi.SetPreferredStoreRequestObject{Body: &body})
	if err != nil {
		t.Fatal(err)
	}
	stored, ok := response.(groceryapi.SetPreferredStore200JSONResponse)
	if !ok || stored.SetAt != 2 {
		t.Fatalf("response = %#v (%T)", response, response)
	}
	if repository.preferred == nil || repository.preferred.SetAt != 2 {
		t.Fatalf("stored preferred store = %#v", repository.preferred)
	}
}

func TestPreferredStoreNoOpReturnsCanonicalTimestamp(t *testing.T) {
	repository := newFakeShoppingRepository()
	api := newTestShoppingAPI(repository)
	now := time.Unix(2, 0)
	api.now = func() time.Time { return now }
	body := decodeShoppingBody[groceryapi.SetPreferredStoreJSONRequestBody](t, `{
		"location_id":"store-1","name":"Market","address":"1 Main","chain":"Kroger"
	}`)

	first, err := api.SetPreferredStore(verifiedGroceryContext(t), groceryapi.SetPreferredStoreRequestObject{Body: &body})
	if err != nil {
		t.Fatal(err)
	}
	now = time.Unix(3_602, 0)
	second, err := api.SetPreferredStore(verifiedGroceryContext(t), groceryapi.SetPreferredStoreRequestObject{Body: &body})
	if err != nil {
		t.Fatal(err)
	}
	firstStored, firstOK := first.(groceryapi.SetPreferredStore200JSONResponse)
	secondStored, secondOK := second.(groceryapi.SetPreferredStore200JSONResponse)
	if !firstOK || !secondOK || firstStored.SetAt != 2 || secondStored.SetAt != firstStored.SetAt {
		t.Fatalf("canonical responses = %#v / %#v", first, second)
	}
}

func TestGatewayGroceryRouteAllowsMCPBearerRoundTrip(t *testing.T) {
	registry, err := agentruntime.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	userinfo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/userinfo" || request.Header.Get("Authorization") != "Bearer mcp-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"sub":"abc"}`))
	}))
	defer userinfo.Close()
	shopping := newFakeShoppingRepository()
	handler, err := New(config.Config{}, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(), Groceries: &fakeGroceryRepository{},
		Shopping: shopping, KrogerMCPURL: userinfo.URL + "/mcp",
		Now: func() time.Time { return time.Unix(2, 0) },
	})
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/grocery/pantry", strings.NewReader(`{"items":[{"name":"Milk"}]}`))
	request.Header.Set("Authorization", "Bearer mcp-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("POST response = %d %s", recorder.Code, recorder.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/grocery/pantry", nil)
	request.Header.Set("Authorization", "Bearer mcp-token")
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"name":"Milk"`) {
		t.Fatalf("GET response = %d %s", recorder.Code, recorder.Body.String())
	}
	if shopping.resolvedSubject != "abc" || shopping.resolveCalls != 2 {
		t.Fatalf("resolved subject = %q, calls = %d", shopping.resolvedSubject, shopping.resolveCalls)
	}
}

func TestGatewayGroceryRouteRejectsAnonymous(t *testing.T) {
	registry, err := agentruntime.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{}, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(), Groceries: &fakeGroceryRepository{},
		Shopping: newFakeShoppingRepository(), Now: time.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/grocery/pantry", nil))
	if recorder.Code != http.StatusUnauthorized || !strings.Contains(recorder.Body.String(), `"detail":"Unauthorized"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGroceryHTTPAuthenticatesBeforeBodyValidation(t *testing.T) {
	bodies := map[string]string{
		"malformed": `{"items":`,
		"oversized": `{"items":[{"name":"` + strings.Repeat("a", maxGroceryAPIRequestBody) + `"}]}`,
	}
	userinfo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	defer userinfo.Close()
	for authName, configure := range map[string]func(*http.Request){
		"missing": func(*http.Request) {},
		"invalid bearer": func(request *http.Request) {
			request.Header.Set("Authorization", "Bearer invalid")
		},
	} {
		for bodyName, body := range bodies {
			t.Run(authName+"/"+bodyName, func(t *testing.T) {
				shopping := newFakeShoppingRepository()
				library := &fakeGroceryRepository{}
				mux := http.NewServeMux()
				if err := registerGroceryAPI(mux, library, shopping, time.Now); err != nil {
					t.Fatal(err)
				}
				handler := auth.RequireIdentity(nil, mux, newKrogerTokenVerifier(shopping, userinfo.URL+"/mcp", userinfo.Client()))
				request := httptest.NewRequest(http.MethodPost, "/api/grocery/pantry", strings.NewReader(body))
				configure(request)
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, request)
				if recorder.Code != http.StatusUnauthorized || recorder.Body.String() != "{\"detail\":\"Unauthorized\"}\n" {
					t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
				}
				if shopping.resolveCalls != 0 || len(shopping.pantry) != 0 || library.dataCalls != 0 {
					t.Fatalf("resolve calls = %d, pantry = %#v, library data calls = %d", shopping.resolveCalls, shopping.pantry, library.dataCalls)
				}
			})
		}
	}
}

func TestGatewayPreferredStoreNotFoundIsStructured404(t *testing.T) {
	mux := http.NewServeMux()
	if err := registerGroceryAPI(mux, &fakeGroceryRepository{}, newFakeShoppingRepository(), time.Now); err != nil {
		t.Fatal(err)
	}
	handler := auth.RequireIdentity(nil, mux, acceptingVerifier{})
	request := httptest.NewRequest(http.MethodGet, "/api/grocery/preferred-store", nil)
	request.Header.Set("Authorization", "Bearer clerk-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound || recorder.Body.String() != "{\"error\":\"grocery_not_found\"}\n" {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestExistingGroceryRouteAcceptsVerifiedIdentity(t *testing.T) {
	shopping := newFakeShoppingRepository()
	library := &shopperCapturingLibrary{fakeGroceryRepository: &fakeGroceryRepository{}}
	mux := http.NewServeMux()
	if err := registerGroceryAPI(mux, library, shopping, time.Now); err != nil {
		t.Fatal(err)
	}
	handler := auth.RequireIdentity(nil, mux, acceptingVerifier{})
	request := httptest.NewRequest(http.MethodGet, "/api/grocery/households", nil)
	request.Header.Set("Authorization", "Bearer clerk-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if library.userID != "clerk-user" {
		t.Fatalf("acting user = %q", library.userID)
	}
}

func TestVerifiedIdentityPreauthorizationRunsOnce(t *testing.T) {
	shopping := newFakeShoppingRepository()
	library := &fakeGroceryRepository{owner: true}
	mux := http.NewServeMux()
	if err := registerGroceryAPI(mux, library, shopping, func() time.Time { return time.Unix(2, 0) }); err != nil {
		t.Fatal(err)
	}
	handler := auth.RequireIdentity(nil, mux, acceptingVerifier{})
	request := httptest.NewRequest(http.MethodPost, "/api/grocery/households/hh-1/invites", strings.NewReader(`{}`))
	request.Header.Set("Authorization", "Bearer clerk-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if library.authorizationCalls != 1 {
		t.Fatalf("authorization calls = %d", library.authorizationCalls)
	}
	if shopping.resolveCalls != 0 {
		t.Fatalf("shopper resolution calls = %d", shopping.resolveCalls)
	}
	if library.authorizedUser != "clerk-user" || library.createdInviteBy != "clerk-user" {
		t.Fatalf("authorized user = %q, mutation user = %q", library.authorizedUser, library.createdInviteBy)
	}
}

func newTestShoppingAPI(repository groceries.ShoppingRepository) *groceryAPI {
	return &groceryAPI{
		repository: &fakeGroceryRepository{}, shopping: repository,
		now: func() time.Time { return time.Unix(2, 0) }, inviteCode: newInviteCode,
	}
}

func assertShoppingError(t *testing.T, response any, wantStatus int, wantCode string) {
	t.Helper()
	var status int
	var body groceryapi.Error
	switch typed := response.(type) {
	case groceryapi.GetPantrydefaultJSONResponse:
		status, body = typed.StatusCode, typed.Body
	case groceryapi.GetPreferredStoredefaultJSONResponse:
		status, body = typed.StatusCode, typed.Body
	default:
		t.Fatalf("response type = %T", response)
	}
	if status != wantStatus || body.Error != wantCode {
		t.Fatalf("response = %d %#v, want %d %q", status, body, wantStatus, wantCode)
	}
}

func decodeShoppingBody[T any](t *testing.T, source string) T {
	t.Helper()
	var body T
	if err := json.Unmarshal([]byte(source), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

type shopperCapturingLibrary struct {
	*fakeGroceryRepository
	userID string
}

func (f *shopperCapturingLibrary) ListHouseholds(_ context.Context, userID string) ([]groceries.Household, error) {
	f.userID = userID
	return []groceries.Household{}, nil
}

type fakeShoppingRepository struct {
	mu sync.Mutex

	resolvedSubject string
	resolveCalls    int
	lastUserID      string
	pantry          []groceries.PantryItem
	equipment       []groceries.EquipmentItem
	orders          []groceries.Order
	preferred       *groceries.PreferredStore

	linkedSubject string
	linkedUserID  string
	linkedAt      time.Time
	linkCalls     int
	linkSignal    chan struct{}
}

func newFakeShoppingRepository() *fakeShoppingRepository {
	return &fakeShoppingRepository{linkSignal: make(chan struct{}, 10)}
}

func (f *fakeShoppingRepository) ResolveShopper(_ context.Context, subject string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.resolveCalls++
	f.resolvedSubject = subject
	return "clerk-resolved", nil
}

func (f *fakeShoppingRepository) Pantry(_ context.Context, userID string) ([]groceries.PantryItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	return append([]groceries.PantryItem(nil), f.pantry...), nil
}

func (f *fakeShoppingRepository) AddPantryItems(_ context.Context, userID string, items []groceries.PantryItem, now time.Time) ([]groceries.PantryItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	for index := range items {
		items[index].AddedAt = now.Unix()
	}
	f.pantry = append(f.pantry, items...)
	return append([]groceries.PantryItem(nil), f.pantry...), nil
}

func (f *fakeShoppingRepository) RemovePantryItems(_ context.Context, userID string, names []string) ([]groceries.PantryItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	remove := make(map[string]bool, len(names))
	for _, name := range names {
		remove[name] = true
	}
	remaining := f.pantry[:0]
	for _, item := range f.pantry {
		if !remove[item.Name] {
			remaining = append(remaining, item)
		}
	}
	f.pantry = remaining
	return append([]groceries.PantryItem(nil), f.pantry...), nil
}

func (f *fakeShoppingRepository) SetPantryQuantity(_ context.Context, userID, name string, quantity float64) ([]groceries.PantryItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	for index := range f.pantry {
		if f.pantry[index].Name == name {
			f.pantry[index].Quantity = quantity
		}
	}
	return append([]groceries.PantryItem(nil), f.pantry...), nil
}

func (f *fakeShoppingRepository) ClearPantry(_ context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	f.pantry = nil
	return nil
}

func (f *fakeShoppingRepository) Equipment(_ context.Context, userID string) ([]groceries.EquipmentItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	return append([]groceries.EquipmentItem(nil), f.equipment...), nil
}

func (f *fakeShoppingRepository) AddEquipment(_ context.Context, userID string, items []groceries.EquipmentItem, now time.Time) ([]groceries.EquipmentItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	for index := range items {
		items[index].AddedAt = now.Unix()
	}
	f.equipment = append(f.equipment, items...)
	return append([]groceries.EquipmentItem(nil), f.equipment...), nil
}

func (f *fakeShoppingRepository) RemoveEquipment(_ context.Context, userID string, _ []string) ([]groceries.EquipmentItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	f.equipment = nil
	return []groceries.EquipmentItem{}, nil
}

func (f *fakeShoppingRepository) ClearEquipment(_ context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	f.equipment = nil
	return nil
}

func (f *fakeShoppingRepository) RecordOrder(_ context.Context, userID string, order groceries.Order, now time.Time) (groceries.Order, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	if order.ID == "" {
		order.ID = "order-1"
	}
	if order.PlacedAt == 0 {
		order.PlacedAt = now.Unix()
	}
	f.orders = append(f.orders, order)
	return order, nil
}

func (f *fakeShoppingRepository) RecentOrders(_ context.Context, userID string, limit int) ([]groceries.Order, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	orders := append([]groceries.Order(nil), f.orders...)
	if limit > 0 && limit < len(orders) {
		orders = orders[:limit]
	}
	return orders, nil
}

func (f *fakeShoppingRepository) PreferredStore(_ context.Context, userID string) (*groceries.PreferredStore, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	if f.preferred == nil {
		return nil, nil
	}
	copy := *f.preferred
	return &copy, nil
}

func (f *fakeShoppingRepository) SetPreferredStore(_ context.Context, userID string, store groceries.PreferredStore, now time.Time) (groceries.PreferredStore, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	if f.preferred != nil && f.preferred.LocationID == store.LocationID && f.preferred.Name == store.Name &&
		f.preferred.Address == store.Address && f.preferred.Chain == store.Chain {
		return *f.preferred, nil
	}
	store.SetAt = now.Unix()
	f.preferred = &store
	return store, nil
}

func (f *fakeShoppingRepository) ClearPreferredStore(_ context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	f.preferred = nil
	return nil
}

func (f *fakeShoppingRepository) ShoppingProfile(_ context.Context, userID string) (groceries.ShoppingProfile, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastUserID = userID
	return groceries.ShoppingProfile{
		PreferredStore: f.preferred, Pantry: append([]groceries.PantryItem(nil), f.pantry...),
		Equipment: append([]groceries.EquipmentItem(nil), f.equipment...), RecentOrders: append([]groceries.Order(nil), f.orders...),
		FrequentItems: []groceries.FrequentItem{},
	}, nil
}

func (f *fakeShoppingRepository) LinkKrogerAccount(_ context.Context, subject, userID string, now time.Time) error {
	f.mu.Lock()
	f.linkCalls++
	f.linkedSubject, f.linkedUserID, f.linkedAt = subject, userID, now
	f.mu.Unlock()
	select {
	case f.linkSignal <- struct{}{}:
	default:
	}
	return nil
}
