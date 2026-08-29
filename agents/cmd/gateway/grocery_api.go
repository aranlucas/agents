package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"agents/internal/auth"
	"agents/internal/groceries"
	"agents/internal/groceryapi"
	"github.com/getkin/kin-openapi/openapi3filter"
	nethttpmiddleware "github.com/oapi-codegen/nethttp-middleware"
)

const maxGroceryAPIRequestBody = 256 << 10

type groceryAPI struct {
	repository groceries.LibraryRepository
	shopping   groceries.ShoppingRepository
	now        func() time.Time
	inviteCode func() (string, error)
}

var _ groceryapi.StrictServerInterface = (*groceryAPI)(nil)

type groceryPreauthorization string

const (
	preauthorizeHouseholdOwner groceryPreauthorization = "household-owner"
	preauthorizeListAccess     groceryPreauthorization = "list-access"
)

var groceryAPIRoutes = [...]struct {
	pattern          string
	jsonBody         bool
	preauthorization groceryPreauthorization
}{
	{pattern: "GET /api/grocery/equipment"},
	{pattern: "POST /api/grocery/equipment", jsonBody: true},
	{pattern: "POST /api/grocery/equipment/remove", jsonBody: true},
	{pattern: "GET /api/grocery/households"},
	{pattern: "POST /api/grocery/households", jsonBody: true},
	{pattern: "POST /api/grocery/households/{id}/invites", jsonBody: true, preauthorization: preauthorizeHouseholdOwner},
	{pattern: "POST /api/grocery/invites/{code}/join"},
	{pattern: "GET /api/grocery/lists"},
	{pattern: "POST /api/grocery/lists", jsonBody: true},
	{pattern: "GET /api/grocery/lists/{id}"},
	{pattern: "PATCH /api/grocery/lists/{id}", jsonBody: true},
	{pattern: "POST /api/grocery/lists/{id}/items", jsonBody: true, preauthorization: preauthorizeListAccess},
	{pattern: "DELETE /api/grocery/lists/{id}/items/{itemId}"},
	{pattern: "PATCH /api/grocery/lists/{id}/items/{itemId}", jsonBody: true, preauthorization: preauthorizeListAccess},
	{pattern: "GET /api/grocery/recipes"},
	{pattern: "POST /api/grocery/recipes", jsonBody: true},
	{pattern: "GET /api/grocery/recipes/{id}"},
	{pattern: "PUT /api/grocery/recipes/{id}", jsonBody: true},
	{pattern: "GET /api/grocery/orders"},
	{pattern: "POST /api/grocery/orders", jsonBody: true},
	{pattern: "GET /api/grocery/pantry"},
	{pattern: "POST /api/grocery/pantry", jsonBody: true},
	{pattern: "POST /api/grocery/pantry/quantity", jsonBody: true},
	{pattern: "POST /api/grocery/pantry/remove", jsonBody: true},
	{pattern: "DELETE /api/grocery/preferred-store"},
	{pattern: "GET /api/grocery/preferred-store"},
	{pattern: "PUT /api/grocery/preferred-store", jsonBody: true},
	{pattern: "GET /api/grocery/profile"},
}

func registerGroceryAPI(
	mux *http.ServeMux,
	repository groceries.LibraryRepository,
	shopping groceries.ShoppingRepository,
	now func() time.Time,
) error {
	spec, err := groceryapi.GetSpec()
	if err != nil {
		return fmt.Errorf("load grocery API specification: %w", err)
	}
	if err := spec.Validate(context.Background()); err != nil {
		return fmt.Errorf("validate grocery API specification: %w", err)
	}

	api := &groceryAPI{
		repository: repository, shopping: shopping,
		now: now, inviteCode: newInviteCode,
	}
	strictHandler := groceryapi.NewStrictHandlerWithOptions(api, nil, groceryapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			writeGatewayJSONError(w, http.StatusServiceUnavailable, "grocery_api_unavailable")
		},
	})

	generatedMux := http.NewServeMux()
	groceryapi.HandlerWithOptions(strictHandler, groceryapi.StdHTTPServerOptions{
		BaseRouter: generatedMux,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		},
	})

	validate := nethttpmiddleware.OapiRequestValidatorWithOptions(spec, &nethttpmiddleware.Options{
		Options: openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc},
		ErrorHandler: func(w http.ResponseWriter, _ string, _ int) {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
		},
	})
	validated := validate(generatedMux)

	for _, route := range groceryAPIRoutes {
		handler := validated
		if route.jsonBody {
			handler = validateGroceryJSONBody(validated)
		}
		if route.preauthorization != "" {
			handler = api.preauthorizeGroceryRequest(route.pattern, route.preauthorization, handler)
		}
		handler = api.authenticateGroceryRequest(handler)
		mux.Handle(route.pattern, handler)
	}
	return nil
}

type groceryShopperContextKey struct{}

type groceryShopperContext struct {
	userID string
}

// authenticateGroceryRequest authenticates before body reads and schema
// validation. The private request-local cache lets later strict and resource
// authorization layers reuse the same resolved shopper without trusting a
// caller-controlled context value.
func (api *groceryAPI) authenticateGroceryRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, responseError, status := api.shopperID(r.Context())
		if responseError != nil {
			writeGatewayJSONError(w, status, responseError.Error)
			return
		}

		ctx := context.WithValue(r.Context(), groceryShopperContextKey{}, groceryShopperContext{userID: userID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type groceryPreauthorizationContextKey struct{}

type groceryPreauthorizationContext struct {
	pattern    string
	resourceID string
	userID     string
}

func (api *groceryAPI) preauthorizeGroceryRequest(pattern string, authorization groceryPreauthorization, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, status, authError := api.preauthorizationShopperID(r)
		if authError != nil {
			writeGatewayJSONError(w, status, authError.Error)
			return
		}

		resourceID := r.PathValue("id")
		var responseError *groceryapi.Error
		switch authorization {
		case preauthorizeHouseholdOwner:
			status, responseError = api.authorizeHousehold(r.Context(), userID, resourceID, true)
		case preauthorizeListAccess:
			status, responseError = api.authorizeList(r.Context(), userID, resourceID)
		}
		if responseError != nil {
			writeGatewayJSONError(w, status, responseError.Error)
			return
		}

		marker := groceryPreauthorizationContext{pattern: pattern, resourceID: resourceID, userID: userID}
		ctx := context.WithValue(r.Context(), groceryPreauthorizationContextKey{}, marker)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// preauthorizationShopperID checks identity before the request body is decoded
// and reuses the route authentication cache.
func (api *groceryAPI) preauthorizationShopperID(r *http.Request) (string, int, *groceryapi.Error) {
	userID, responseError, status := api.shopperID(r.Context())
	return userID, status, responseError
}

func groceryRequestPreauthorized(ctx context.Context, pattern, resourceID, userID string) bool {
	marker, ok := ctx.Value(groceryPreauthorizationContextKey{}).(groceryPreauthorizationContext)
	return ok && marker.pattern == pattern && marker.resourceID == resourceID && marker.userID == userID
}

func validateGroceryJSONBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limited := http.MaxBytesReader(w, r.Body, maxGroceryAPIRequestBody)
		body, err := io.ReadAll(limited)
		_ = limited.Close()
		if err != nil {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))

		if len(body) != 0 {
			var document jsontext.Value
			if err := json.UnmarshalRead(bytes.NewReader(body), &document); err != nil {
				writeGatewayJSONError(w, http.StatusBadRequest, "invalid_grocery_request")
				return
			}
		}

		// The handwritten handlers accepted JSON regardless of Content-Type.
		// Preserve that behavior while validating against the JSON schema.
		r.Header.Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func (api *groceryAPI) CreateHousehold(ctx context.Context, request groceryapi.CreateHouseholdRequestObject) (groceryapi.CreateHouseholdResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.CreateHouseholddefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	household, err := api.repository.CreateHousehold(ctx, userID, request.Body.Name, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.CreateHouseholddefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.CreateHousehold201JSONResponse(toAPIHousehold(household)), nil
}

func (api *groceryAPI) ListHouseholds(ctx context.Context, request groceryapi.ListHouseholdsRequestObject) (groceryapi.ListHouseholdsResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.ListHouseholdsdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	households, err := api.repository.ListHouseholds(ctx, userID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.ListHouseholdsdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.ListHouseholds200JSONResponse(toAPIHouseholds(households)), nil
}

func (api *groceryAPI) CreateInvite(ctx context.Context, request groceryapi.CreateInviteRequestObject) (groceryapi.CreateInviteResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.CreateInvitedefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if !groceryRequestPreauthorized(ctx, "POST /api/grocery/households/{id}/invites", request.Id, userID) {
		if status, body := api.authorizeHousehold(ctx, userID, request.Id, true); body != nil {
			return groceryapi.CreateInvitedefaultJSONResponse{StatusCode: status, Body: *body}, nil
		}
	}
	maxUses := 0
	if request.Body.MaxUses != nil {
		maxUses = *request.Body.MaxUses
	}
	if maxUses == 0 {
		maxUses = 10
	}
	code, err := api.inviteCode()
	if err != nil {
		return groceryapi.CreateInvitedefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	invite, err := api.repository.CreateInvite(ctx, userID, request.Id, code, maxUses, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.CreateInvitedefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.CreateInvite201JSONResponse(toAPIInvite(invite)), nil
}

func (api *groceryAPI) JoinHousehold(ctx context.Context, request groceryapi.JoinHouseholdRequestObject) (groceryapi.JoinHouseholdResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.JoinHouseholddefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	household, err := api.repository.JoinHousehold(ctx, userID, request.Code, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.JoinHouseholddefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.JoinHousehold200JSONResponse(toAPIHousehold(household)), nil
}

func (api *groceryAPI) ListLists(ctx context.Context, request groceryapi.ListListsRequestObject) (groceryapi.ListListsResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.ListListsdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	householdID := ""
	if request.Params.HouseholdId != nil {
		householdID = strings.TrimSpace(*request.Params.HouseholdId)
	}
	if householdID == "" {
		lists, err := api.repository.ListPersonalLists(ctx, userID)
		if err != nil {
			status, body := groceryErrorResponse(err)
			return groceryapi.ListListsdefaultJSONResponse{StatusCode: status, Body: body}, nil
		}
		return groceryapi.ListLists200JSONResponse(toAPILists(lists)), nil
	}
	if status, body := api.authorizeHousehold(ctx, userID, householdID, false); body != nil {
		return groceryapi.ListListsdefaultJSONResponse{StatusCode: status, Body: *body}, nil
	}
	lists, err := api.repository.ListLists(ctx, userID, householdID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.ListListsdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.ListLists200JSONResponse(toAPILists(lists)), nil
}

func (api *groceryAPI) GetList(ctx context.Context, request groceryapi.GetListRequestObject) (groceryapi.GetListResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetListdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if status, body := api.authorizeList(ctx, userID, request.Id); body != nil {
		return groceryapi.GetListdefaultJSONResponse{StatusCode: status, Body: *body}, nil
	}
	list, err := api.repository.GetList(ctx, userID, request.Id)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetListdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetList200JSONResponse(toAPIList(list)), nil
}

func (api *groceryAPI) CreateList(ctx context.Context, request groceryapi.CreateListRequestObject) (groceryapi.CreateListResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.CreateListdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if request.Body.HouseholdId != nil {
		if status, body := api.authorizeHousehold(ctx, userID, *request.Body.HouseholdId, false); body != nil {
			return groceryapi.CreateListdefaultJSONResponse{StatusCode: status, Body: *body}, nil
		}
	}
	var items []groceries.NewItem
	if request.Body.Items != nil {
		items = toGroceryNewItems(*request.Body.Items)
	}
	list, err := api.repository.SaveList(ctx, userID, groceries.SavedListInput{
		HouseholdID: request.Body.HouseholdId,
		Title:       request.Body.Title,
		Items:       items,
	}, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.CreateListdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.CreateList201JSONResponse(toAPIList(list)), nil
}

func (api *groceryAPI) UpdateList(ctx context.Context, request groceryapi.UpdateListRequestObject) (groceryapi.UpdateListResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.UpdateListdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	list, err := api.repository.UpdateList(ctx, userID, request.Id, groceries.ListPatch{
		Title:  request.Body.Title,
		Status: request.Body.Status,
	}, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.UpdateListdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.UpdateList200JSONResponse(toAPIList(list)), nil
}

func (api *groceryAPI) AddItems(ctx context.Context, request groceryapi.AddItemsRequestObject) (groceryapi.AddItemsResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.AddItemsdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if !groceryRequestPreauthorized(ctx, "POST /api/grocery/lists/{id}/items", request.Id, userID) {
		if status, body := api.authorizeList(ctx, userID, request.Id); body != nil {
			return groceryapi.AddItemsdefaultJSONResponse{StatusCode: status, Body: *body}, nil
		}
	}
	items, err := api.repository.AddItems(ctx, userID, request.Id, toGroceryNewItems(request.Body.Items), api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.AddItemsdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.AddItems201JSONResponse(toAPIItems(items)), nil
}

func (api *groceryAPI) UpdateItem(ctx context.Context, request groceryapi.UpdateItemRequestObject) (groceryapi.UpdateItemResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.UpdateItemdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if !groceryRequestPreauthorized(ctx, "PATCH /api/grocery/lists/{id}/items/{itemId}", request.Id, userID) {
		if status, body := api.authorizeList(ctx, userID, request.Id); body != nil {
			return groceryapi.UpdateItemdefaultJSONResponse{StatusCode: status, Body: *body}, nil
		}
	}
	item, err := api.repository.UpdateItem(ctx, userID, request.Id, request.ItemId, groceries.ItemPatch{
		Name:     request.Body.Name,
		Quantity: request.Body.Quantity,
		Note:     request.Body.Note,
		Checked:  request.Body.Checked,
	}, api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.UpdateItemdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.UpdateItem200JSONResponse(toAPIItem(item)), nil
}

func (api *groceryAPI) DeleteItem(ctx context.Context, request groceryapi.DeleteItemRequestObject) (groceryapi.DeleteItemResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.DeleteItemdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if status, body := api.authorizeList(ctx, userID, request.Id); body != nil {
		return groceryapi.DeleteItemdefaultJSONResponse{StatusCode: status, Body: *body}, nil
	}
	if err := api.repository.DeleteItem(ctx, userID, request.Id, request.ItemId, api.currentTime()); err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.DeleteItemdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.DeleteItem204Response{}, nil
}

func (api *groceryAPI) ListRecipes(ctx context.Context, request groceryapi.ListRecipesRequestObject) (groceryapi.ListRecipesResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.ListRecipesdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	var householdID *string
	if request.Params.HouseholdId != nil {
		if value := strings.TrimSpace(*request.Params.HouseholdId); value != "" {
			householdID = &value
		}
	}
	recipes, err := api.repository.ListRecipes(ctx, userID, householdID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.ListRecipesdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.ListRecipes200JSONResponse(toAPIRecipes(recipes)), nil
}

func (api *groceryAPI) GetRecipe(ctx context.Context, request groceryapi.GetRecipeRequestObject) (groceryapi.GetRecipeResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetRecipedefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	recipe, err := api.repository.GetRecipe(ctx, userID, request.Id)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetRecipedefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetRecipe200JSONResponse(toAPIRecipe(recipe)), nil
}

func (api *groceryAPI) CreateRecipe(ctx context.Context, request groceryapi.CreateRecipeRequestObject) (groceryapi.CreateRecipeResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.CreateRecipedefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	recipe, err := api.repository.SaveRecipe(ctx, userID, toGrocerySavedRecipeInput(*request.Body), api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.CreateRecipedefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.CreateRecipe201JSONResponse(toAPIRecipe(recipe)), nil
}

func (api *groceryAPI) UpdateRecipe(ctx context.Context, request groceryapi.UpdateRecipeRequestObject) (groceryapi.UpdateRecipeResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.UpdateRecipedefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	recipe, err := api.repository.UpdateRecipe(ctx, userID, request.Id, toGroceryRecipeContent(*request.Body), api.currentTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.UpdateRecipedefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.UpdateRecipe200JSONResponse(toAPIRecipe(recipe)), nil
}

func (api *groceryAPI) authorizeHousehold(ctx context.Context, userID, householdID string, ownerOnly bool) (int, *groceryapi.Error) {
	householdID = strings.TrimSpace(householdID)
	if householdID == "" {
		body := groceryapi.Error{Error: "invalid_grocery_request"}
		return http.StatusBadRequest, &body
	}
	var (
		allowed bool
		err     error
	)
	if ownerOnly {
		allowed, err = api.repository.IsOwner(ctx, userID, householdID)
	} else {
		allowed, err = api.repository.IsMember(ctx, userID, householdID)
	}
	if err != nil {
		status, body := groceryErrorResponse(err)
		return status, &body
	}
	if !allowed {
		body := groceryapi.Error{Error: "grocery_forbidden"}
		return http.StatusForbidden, &body
	}
	return 0, nil
}

func (api *groceryAPI) authorizeList(ctx context.Context, userID, listID string) (int, *groceryapi.Error) {
	listID = strings.TrimSpace(listID)
	if listID == "" {
		body := groceryapi.Error{Error: "invalid_grocery_request"}
		return http.StatusBadRequest, &body
	}
	allowed, err := api.repository.CanAccessList(ctx, userID, listID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return status, &body
	}
	if !allowed {
		body := groceryapi.Error{Error: "grocery_forbidden"}
		return http.StatusForbidden, &body
	}
	return 0, nil
}

func (api *groceryAPI) currentTime() time.Time {
	if api.now == nil {
		return time.Now()
	}
	return api.now()
}

// shopperID accepts only identities installed by the route's bearer-token
// verifier. The request-local cache avoids repeating authentication checks.
func (api *groceryAPI) shopperID(ctx context.Context) (string, *groceryapi.Error, int) {
	if shopper, ok := ctx.Value(groceryShopperContextKey{}).(groceryShopperContext); ok {
		userID := strings.TrimSpace(shopper.userID)
		if userID == "" {
			body := groceryapi.Error{Error: "grocery_api_unavailable"}
			return "", &body, http.StatusServiceUnavailable
		}
		return userID, nil, 0
	}
	identity, ok := auth.FromContext(ctx)
	if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
		body := groceryapi.Error{Error: "unauthorized"}
		return "", &body, http.StatusUnauthorized
	}
	return strings.TrimSpace(identity.UserID), nil, 0
}

func groceryErrorResponse(err error) (int, groceryapi.Error) {
	status := http.StatusServiceUnavailable
	code := "grocery_api_unavailable"
	switch {
	case errors.Is(err, groceries.ErrInvalid):
		status, code = http.StatusBadRequest, "invalid_grocery_request"
	case errors.Is(err, groceries.ErrForbidden):
		status, code = http.StatusForbidden, "grocery_forbidden"
	case errors.Is(err, groceries.ErrNotFound):
		status, code = http.StatusNotFound, "grocery_not_found"
	case errors.Is(err, groceries.ErrInviteExpired):
		status, code = http.StatusGone, "grocery_invite_expired"
	case errors.Is(err, groceries.ErrInviteExhausted):
		status, code = http.StatusConflict, "grocery_invite_exhausted"
	}
	return status, groceryapi.Error{Error: code}
}

func toAPIHousehold(value groceries.Household) groceryapi.Household {
	return groceryapi.Household{Id: value.ID, Name: value.Name, Role: value.Role, CreatedBy: value.CreatedBy, CreatedAt: value.CreatedAt}
}

func toAPIHouseholds(values []groceries.Household) []groceryapi.Household {
	if values == nil {
		return nil
	}
	result := make([]groceryapi.Household, len(values))
	for index, value := range values {
		result[index] = toAPIHousehold(value)
	}
	return result
}

func toAPIInvite(value groceries.Invite) groceryapi.Invite {
	return groceryapi.Invite{Code: value.Code, HouseholdId: value.HouseholdID, CreatedBy: value.CreatedBy, ExpiresAt: value.ExpiresAt, MaxUses: value.MaxUses, UsedCount: value.UsedCount}
}

func toAPIList(value groceries.List) groceryapi.List {
	return groceryapi.List{
		Id: value.ID, HouseholdId: value.HouseholdID, OwnerUserId: value.OwnerUserID,
		Title: value.Title, Status: value.Status, ArtifactVersion: value.ArtifactVersion,
		CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt, Items: toAPIItems(value.Items),
	}
}

func toAPILists(values []groceries.List) []groceryapi.List {
	if values == nil {
		return nil
	}
	result := make([]groceryapi.List, len(values))
	for index, value := range values {
		result[index] = toAPIList(value)
	}
	return result
}

func toAPIItem(value groceries.Item) groceryapi.Item {
	return groceryapi.Item{
		Id: value.ID, ListId: value.ListID, Name: value.Name, Quantity: value.Quantity,
		Note: value.Note, Upc: value.Upc, Product: toAPIProductReference(value.Product), Position: value.Position, AddedBy: value.AddedBy,
		CheckedBy: value.CheckedBy, CheckedAt: value.CheckedAt, UpdatedAt: value.UpdatedAt,
	}
}

func toAPIItems(values []groceries.Item) []groceryapi.Item {
	if values == nil {
		return nil
	}
	result := make([]groceryapi.Item, len(values))
	for index, value := range values {
		result[index] = toAPIItem(value)
	}
	return result
}

func toGroceryNewItems(values []groceryapi.NewItem) []groceries.NewItem {
	if values == nil {
		return nil
	}
	result := make([]groceries.NewItem, len(values))
	for index, value := range values {
		result[index] = groceries.NewItem{Name: value.Name, Quantity: value.Quantity, Note: value.Note, Upc: value.Upc, Product: toGroceryProductReference(value.Product)}
	}
	return result
}

func toAPIProductReference(value *groceries.ProductReference) *groceryapi.ProductReference {
	if value == nil {
		return nil
	}
	return &groceryapi.ProductReference{Provider: value.Provider, Id: value.ID}
}

func toGroceryProductReference(value *groceryapi.ProductReference) *groceries.ProductReference {
	if value == nil {
		return nil
	}
	return &groceries.ProductReference{Provider: value.Provider, ID: value.Id}
}

func toAPIRecipe(value groceries.Recipe) groceryapi.Recipe {
	ingredients := make([]groceryapi.Ingredient, len(value.Ingredients))
	for index, ingredient := range value.Ingredients {
		ingredients[index] = groceryapi.Ingredient{
			Id: ingredient.ID, RecipeId: ingredient.RecipeID, Name: ingredient.Name,
			Quantity: ingredient.Quantity, Unit: ingredient.Unit, Note: ingredient.Note, Position: ingredient.Position,
		}
	}
	if value.Ingredients == nil {
		ingredients = nil
	}
	steps := make([]groceryapi.RecipeStep, len(value.Steps))
	for index, step := range value.Steps {
		steps[index] = groceryapi.RecipeStep{Id: step.ID, RecipeId: step.RecipeID, Instruction: step.Instruction, Position: step.Position}
	}
	if value.Steps == nil {
		steps = nil
	}
	return groceryapi.Recipe{
		Id: value.ID, HouseholdId: value.HouseholdID, OwnerUserId: value.OwnerUserID,
		Title: value.Title, Description: value.Description, Servings: value.Servings, Notes: value.Notes,
		Status: value.Status, ArtifactVersion: value.ArtifactVersion, CreatedAt: value.CreatedAt,
		UpdatedAt: value.UpdatedAt, Ingredients: ingredients, Steps: steps, Tags: value.Tags,
	}
}

func toAPIRecipes(values []groceries.Recipe) []groceryapi.Recipe {
	if values == nil {
		return nil
	}
	result := make([]groceryapi.Recipe, len(values))
	for index, value := range values {
		result[index] = toAPIRecipe(value)
	}
	return result
}

func toGroceryRecipeContent(value groceryapi.RecipeContent) groceries.RecipeContent {
	ingredients := make([]groceries.NewIngredient, len(value.Ingredients))
	for index, ingredient := range value.Ingredients {
		ingredients[index] = groceries.NewIngredient{Name: ingredient.Name, Quantity: ingredient.Quantity, Unit: ingredient.Unit, Note: ingredient.Note}
	}
	if value.Ingredients == nil {
		ingredients = nil
	}
	return groceries.RecipeContent{
		Title: value.Title, Description: value.Description, Servings: value.Servings,
		Notes: value.Notes, Ingredients: ingredients, Steps: value.Steps, Tags: value.Tags,
	}
}

func toGrocerySavedRecipeInput(value groceryapi.SavedRecipeInput) groceries.SavedRecipeInput {
	return groceries.SavedRecipeInput{HouseholdID: value.HouseholdId, RecipeContent: toGroceryRecipeContent(groceryapi.RecipeContent{
		Title: value.Title, Description: value.Description, Servings: value.Servings, Notes: value.Notes,
		Ingredients: value.Ingredients, Steps: value.Steps, Tags: value.Tags,
	})}
}

func newInviteCode() (string, error) {
	value := make([]byte, 4)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(value)), nil
}
