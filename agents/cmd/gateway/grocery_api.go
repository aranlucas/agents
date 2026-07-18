package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"agents/internal/auth"
	"agents/internal/groceries"
)

const maxGroceryAPIRequestBody = 256 << 10

type groceryAPI struct {
	repository groceries.LibraryRepository
	now        func() time.Time
	inviteCode func() (string, error)
}

type createHouseholdRequest struct {
	Name string `json:"name"`
}

type createInviteRequest struct {
	MaxUses int `json:"max_uses"`
}

type createGroceryListRequest struct {
	HouseholdID *string             `json:"household_id"`
	Title       string              `json:"title"`
	Items       []groceries.NewItem `json:"items,omitempty"`
}

type addGroceryItemsRequest struct {
	Items []groceries.NewItem `json:"items"`
}

func registerGroceryAPI(mux *http.ServeMux, repository groceries.LibraryRepository, now func() time.Time) {
	api := groceryAPI{repository: repository, now: now, inviteCode: newInviteCode}
	mux.HandleFunc("POST /api/grocery/households", api.createHousehold)
	mux.HandleFunc("GET /api/grocery/households", api.listHouseholds)
	mux.HandleFunc("POST /api/grocery/households/{id}/invites", api.createInvite)
	mux.HandleFunc("POST /api/grocery/invites/{code}/join", api.joinHousehold)
	mux.HandleFunc("GET /api/grocery/lists", api.listLists)
	mux.HandleFunc("GET /api/grocery/lists/{id}", api.getList)
	mux.HandleFunc("POST /api/grocery/lists", api.createList)
	mux.HandleFunc("PATCH /api/grocery/lists/{id}", api.updateList)
	mux.HandleFunc("POST /api/grocery/lists/{id}/items", api.addItems)
	mux.HandleFunc("PATCH /api/grocery/lists/{id}/items/{itemId}", api.updateItem)
	mux.HandleFunc("DELETE /api/grocery/lists/{id}/items/{itemId}", api.deleteItem)
	mux.HandleFunc("GET /api/grocery/recipes", api.listRecipes)
	mux.HandleFunc("GET /api/grocery/recipes/{id}", api.getRecipe)
	mux.HandleFunc("POST /api/grocery/recipes", api.createRecipe)
	mux.HandleFunc("PUT /api/grocery/recipes/{id}", api.updateRecipe)
}

func (api groceryAPI) createHousehold(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	input, ok := decodeGroceryRequest[createHouseholdRequest](w, r)
	if !ok {
		return
	}
	household, err := api.repository.CreateHousehold(r.Context(), userID, input.Name, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusCreated, household)
}

func (api groceryAPI) listHouseholds(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	households, err := api.repository.ListHouseholds(r.Context(), userID)
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, households)
}

func (api groceryAPI) createInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok || !api.authorizeHousehold(w, r, userID, r.PathValue("id"), true) {
		return
	}
	input, ok := decodeGroceryRequest[createInviteRequest](w, r)
	if !ok {
		return
	}
	if input.MaxUses == 0 {
		input.MaxUses = 10
	}
	code, err := api.inviteCode()
	if err != nil {
		writeGatewayJSONError(w, http.StatusServiceUnavailable, "grocery_api_unavailable")
		return
	}
	invite, err := api.repository.CreateInvite(r.Context(), userID, r.PathValue("id"), code, input.MaxUses, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusCreated, invite)
}

func (api groceryAPI) joinHousehold(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	household, err := api.repository.JoinHousehold(r.Context(), userID, r.PathValue("code"), api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, household)
}

func (api groceryAPI) listLists(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	householdID := strings.TrimSpace(r.URL.Query().Get("householdId"))
	if !ok {
		return
	}
	if householdID == "" {
		lists, err := api.repository.ListPersonalLists(r.Context(), userID)
		if err != nil {
			writeGroceryAPIError(w, err)
			return
		}
		writeGroceryJSON(w, http.StatusOK, lists)
		return
	}
	if !api.authorizeHousehold(w, r, userID, householdID, false) {
		return
	}
	lists, err := api.repository.ListLists(r.Context(), userID, householdID)
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, lists)
}

func (api groceryAPI) getList(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	listID := r.PathValue("id")
	if !ok || !api.authorizeList(w, r, userID, listID) {
		return
	}
	list, err := api.repository.GetList(r.Context(), userID, listID)
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, list)
}

func (api groceryAPI) createList(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	input, ok := decodeGroceryRequest[createGroceryListRequest](w, r)
	if !ok {
		return
	}
	if input.HouseholdID != nil && !api.authorizeHousehold(w, r, userID, *input.HouseholdID, false) {
		return
	}
	list, err := api.repository.SaveList(r.Context(), userID, groceries.SavedListInput{
		HouseholdID: input.HouseholdID, Title: input.Title, Items: input.Items,
	}, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusCreated, list)
}

func (api groceryAPI) updateList(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	patch, ok := decodeGroceryRequest[groceries.ListPatch](w, r)
	if !ok {
		return
	}
	list, err := api.repository.UpdateList(r.Context(), userID, r.PathValue("id"), patch, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, list)
}

func (api groceryAPI) listRecipes(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	var householdID *string
	if value := strings.TrimSpace(r.URL.Query().Get("householdId")); value != "" {
		householdID = &value
	}
	recipes, err := api.repository.ListRecipes(r.Context(), userID, householdID)
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, recipes)
}

func (api groceryAPI) getRecipe(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	recipe, err := api.repository.GetRecipe(r.Context(), userID, r.PathValue("id"))
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, recipe)
}

func (api groceryAPI) createRecipe(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	input, ok := decodeGroceryRequest[groceries.SavedRecipeInput](w, r)
	if !ok {
		return
	}
	recipe, err := api.repository.SaveRecipe(r.Context(), userID, input, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusCreated, recipe)
}

func (api groceryAPI) updateRecipe(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	if !ok {
		return
	}
	input, ok := decodeGroceryRequest[groceries.RecipeContent](w, r)
	if !ok {
		return
	}
	recipe, err := api.repository.UpdateRecipe(r.Context(), userID, r.PathValue("id"), input, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, recipe)
}

func (api groceryAPI) addItems(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	listID := r.PathValue("id")
	if !ok || !api.authorizeList(w, r, userID, listID) {
		return
	}
	input, ok := decodeGroceryRequest[addGroceryItemsRequest](w, r)
	if !ok {
		return
	}
	items, err := api.repository.AddItems(r.Context(), userID, listID, input.Items, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusCreated, items)
}

func (api groceryAPI) updateItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	listID := r.PathValue("id")
	if !ok || !api.authorizeList(w, r, userID, listID) {
		return
	}
	patch, ok := decodeGroceryRequest[groceries.ItemPatch](w, r)
	if !ok {
		return
	}
	item, err := api.repository.UpdateItem(r.Context(), userID, listID, r.PathValue("itemId"), patch, api.currentTime())
	if err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	writeGroceryJSON(w, http.StatusOK, item)
}

func (api groceryAPI) deleteItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := groceryUserID(w, r)
	listID := r.PathValue("id")
	if !ok || !api.authorizeList(w, r, userID, listID) {
		return
	}
	if err := api.repository.DeleteItem(r.Context(), userID, listID, r.PathValue("itemId"), api.currentTime()); err != nil {
		writeGroceryAPIError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api groceryAPI) authorizeHousehold(w http.ResponseWriter, r *http.Request, userID, householdID string, ownerOnly bool) bool {
	householdID = strings.TrimSpace(householdID)
	if householdID == "" {
		writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		return false
	}
	var (
		allowed bool
		err     error
	)
	if ownerOnly {
		allowed, err = api.repository.IsOwner(r.Context(), userID, householdID)
	} else {
		allowed, err = api.repository.IsMember(r.Context(), userID, householdID)
	}
	if err != nil {
		writeGroceryAPIError(w, err)
		return false
	}
	if !allowed {
		writeGatewayJSONError(w, http.StatusForbidden, "grocery_forbidden")
		return false
	}
	return true
}

func (api groceryAPI) authorizeList(w http.ResponseWriter, r *http.Request, userID, listID string) bool {
	listID = strings.TrimSpace(listID)
	if listID == "" {
		writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		return false
	}
	allowed, err := api.repository.CanAccessList(r.Context(), userID, listID)
	if err != nil {
		writeGroceryAPIError(w, err)
		return false
	}
	if !allowed {
		writeGatewayJSONError(w, http.StatusForbidden, "grocery_forbidden")
		return false
	}
	return true
}

func (api groceryAPI) currentTime() time.Time {
	if api.now == nil {
		return time.Now()
	}
	return api.now()
}

func groceryUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	identity, ok := auth.FromContext(r.Context())
	if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
		writeGatewayJSONError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	return identity.UserID, true
}

func decodeGroceryRequest[T any](w http.ResponseWriter, r *http.Request) (T, bool) {
	var input T
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxGroceryAPIRequestBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		return input, false
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		return input, false
	}
	return input, true
}

func writeGroceryAPIError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, groceries.ErrInvalid):
		writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
	case errors.Is(err, groceries.ErrForbidden):
		writeGatewayJSONError(w, http.StatusForbidden, "grocery_forbidden")
	case errors.Is(err, groceries.ErrNotFound):
		writeGatewayJSONError(w, http.StatusNotFound, "grocery_not_found")
	case errors.Is(err, groceries.ErrInviteExpired):
		writeGatewayJSONError(w, http.StatusGone, "grocery_invite_expired")
	case errors.Is(err, groceries.ErrInviteExhausted):
		writeGatewayJSONError(w, http.StatusConflict, "grocery_invite_exhausted")
	default:
		writeGatewayJSONError(w, http.StatusServiceUnavailable, "grocery_api_unavailable")
	}
}

func writeGroceryJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func newInviteCode() (string, error) {
	value := make([]byte, 4)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(value)), nil
}
