package gateway

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/groceries"
	"github.com/aranlucas/agents/internal/groceryapi"
)

func (api *groceryAPI) GetPantry(ctx context.Context, request groceryapi.GetPantryRequestObject) (groceryapi.GetPantryResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetPantrydefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.GetPantrydefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	items, err := api.shopping.Pantry(ctx, userID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetPantrydefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetPantry200JSONResponse{Items: toAPIPantryItems(items)}, nil
}

func (api *groceryAPI) AddPantryItems(ctx context.Context, request groceryapi.AddPantryItemsRequestObject) (groceryapi.AddPantryItemsResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.AddPantryItemsdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.AddPantryItemsdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.AddPantryItemsdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	items := make([]groceries.PantryItem, len(request.Body.Items))
	for index, item := range request.Body.Items {
		quantity := 1.0
		if item.Quantity != nil {
			quantity = *item.Quantity
		}
		items[index] = groceries.PantryItem{Name: item.Name, Quantity: quantity, ExpiresAt: item.ExpiresAt}
	}
	stored, err := api.shopping.AddPantryItems(ctx, userID, items, api.currentShoppingTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.AddPantryItemsdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.AddPantryItems200JSONResponse{Items: toAPIPantryItems(stored)}, nil
}

func (api *groceryAPI) RemovePantryItems(ctx context.Context, request groceryapi.RemovePantryItemsRequestObject) (groceryapi.RemovePantryItemsResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.RemovePantryItemsdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.RemovePantryItemsdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.RemovePantryItemsdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	if request.Body.All != nil && *request.Body.All {
		if err := api.shopping.ClearPantry(ctx, userID); err != nil {
			status, body := groceryErrorResponse(err)
			return groceryapi.RemovePantryItemsdefaultJSONResponse{StatusCode: status, Body: body}, nil
		}
		return groceryapi.RemovePantryItems200JSONResponse{Items: []groceryapi.PantryItem{}}, nil
	}
	names := []string(nil)
	if request.Body.Names != nil {
		names = *request.Body.Names
	}
	items, err := api.shopping.RemovePantryItems(ctx, userID, names)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.RemovePantryItemsdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.RemovePantryItems200JSONResponse{Items: toAPIPantryItems(items)}, nil
}

func (api *groceryAPI) SetPantryItemQuantity(ctx context.Context, request groceryapi.SetPantryItemQuantityRequestObject) (groceryapi.SetPantryItemQuantityResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.SetPantryItemQuantitydefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.SetPantryItemQuantitydefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.SetPantryItemQuantitydefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	items, err := api.shopping.SetPantryQuantity(ctx, userID, request.Body.Name, request.Body.Quantity)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.SetPantryItemQuantitydefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.SetPantryItemQuantity200JSONResponse{Items: toAPIPantryItems(items)}, nil
}

func (api *groceryAPI) GetEquipment(ctx context.Context, request groceryapi.GetEquipmentRequestObject) (groceryapi.GetEquipmentResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetEquipmentdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.GetEquipmentdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	items, err := api.shopping.Equipment(ctx, userID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetEquipmentdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetEquipment200JSONResponse{Items: toAPIEquipmentItems(items)}, nil
}

func (api *groceryAPI) AddEquipment(ctx context.Context, request groceryapi.AddEquipmentRequestObject) (groceryapi.AddEquipmentResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.AddEquipmentdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.AddEquipmentdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.AddEquipmentdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	items := make([]groceries.EquipmentItem, len(request.Body.Items))
	for index, item := range request.Body.Items {
		items[index] = groceries.EquipmentItem{Name: item.Name, Category: item.Category}
	}
	stored, err := api.shopping.AddEquipment(ctx, userID, items, api.currentShoppingTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.AddEquipmentdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.AddEquipment200JSONResponse{Items: toAPIEquipmentItems(stored)}, nil
}

func (api *groceryAPI) RemoveEquipment(ctx context.Context, request groceryapi.RemoveEquipmentRequestObject) (groceryapi.RemoveEquipmentResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.RemoveEquipmentdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.RemoveEquipmentdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.RemoveEquipmentdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	if request.Body.All != nil && *request.Body.All {
		if err := api.shopping.ClearEquipment(ctx, userID); err != nil {
			status, body := groceryErrorResponse(err)
			return groceryapi.RemoveEquipmentdefaultJSONResponse{StatusCode: status, Body: body}, nil
		}
		return groceryapi.RemoveEquipment200JSONResponse{Items: []groceryapi.EquipmentItem{}}, nil
	}
	names := []string(nil)
	if request.Body.Names != nil {
		names = *request.Body.Names
	}
	items, err := api.shopping.RemoveEquipment(ctx, userID, names)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.RemoveEquipmentdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.RemoveEquipment200JSONResponse{Items: toAPIEquipmentItems(items)}, nil
}

func (api *groceryAPI) GetOrders(ctx context.Context, request groceryapi.GetOrdersRequestObject) (groceryapi.GetOrdersResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetOrdersdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.GetOrdersdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	limit := 0
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	orders, err := api.shopping.RecentOrders(ctx, userID, limit)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetOrdersdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetOrders200JSONResponse{Orders: toAPIOrders(orders)}, nil
}

func (api *groceryAPI) RecordOrder(ctx context.Context, request groceryapi.RecordOrderRequestObject) (groceryapi.RecordOrderResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.RecordOrderdefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.RecordOrderdefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.RecordOrderdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	order := groceries.Order{
		Items:          toGroceryOrderItems(request.Body.Items),
		TotalItems:     request.Body.TotalItems,
		EstimatedTotal: request.Body.EstimatedTotal,
		PlacedAt:       request.Body.PlacedAt,
		LocationID:     request.Body.LocationId,
		Notes:          request.Body.Notes,
	}
	if request.Body.Id != nil {
		order.ID = *request.Body.Id
	}
	stored, err := api.shopping.RecordOrder(ctx, userID, order, api.currentShoppingTime())
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.RecordOrderdefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.RecordOrder201JSONResponse(toAPIOrder(stored)), nil
}

func (api *groceryAPI) GetPreferredStore(ctx context.Context, request groceryapi.GetPreferredStoreRequestObject) (groceryapi.GetPreferredStoreResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetPreferredStoredefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.GetPreferredStoredefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	store, err := api.shopping.PreferredStore(ctx, userID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetPreferredStoredefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	if store == nil {
		return groceryapi.GetPreferredStoredefaultJSONResponse{StatusCode: http.StatusNotFound, Body: groceryapi.Error{Error: "grocery_not_found"}}, nil
	}
	return groceryapi.GetPreferredStore200JSONResponse(toAPIPreferredStore(*store)), nil
}

func (api *groceryAPI) SetPreferredStore(ctx context.Context, request groceryapi.SetPreferredStoreRequestObject) (groceryapi.SetPreferredStoreResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.SetPreferredStoredefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.SetPreferredStoredefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if request.Body == nil {
		return groceryapi.SetPreferredStoredefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: groceryapi.Error{Error: "invalid_grocery_request"}}, nil
	}
	now := api.currentShoppingTime()
	provider := "kroger"
	if request.Body.Provider != nil {
		provider = strings.TrimSpace(*request.Body.Provider)
	}
	store := groceries.PreferredStore{
		Provider:   provider,
		LocationID: strings.TrimSpace(request.Body.LocationId),
		Name:       strings.TrimSpace(request.Body.Name),
		Address:    strings.TrimSpace(request.Body.Address),
		Chain:      strings.TrimSpace(request.Body.Chain),
		SetAt:      now.Unix(),
	}
	canonical, err := api.shopping.SetPreferredStore(ctx, userID, store, now)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.SetPreferredStoredefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.SetPreferredStore200JSONResponse(toAPIPreferredStore(canonical)), nil
}

func (api *groceryAPI) DeletePreferredStore(ctx context.Context, request groceryapi.DeletePreferredStoreRequestObject) (groceryapi.DeletePreferredStoreResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.DeletePreferredStoredefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.DeletePreferredStoredefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	if err := api.shopping.ClearPreferredStore(ctx, userID); err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.DeletePreferredStoredefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.DeletePreferredStore204Response{}, nil
}

func (api *groceryAPI) GetShoppingProfile(ctx context.Context, request groceryapi.GetShoppingProfileRequestObject) (groceryapi.GetShoppingProfileResponseObject, error) {
	userID, authError, status := api.shopperID(ctx)
	if authError != nil {
		return groceryapi.GetShoppingProfiledefaultJSONResponse{StatusCode: status, Body: *authError}, nil
	}
	if api.shopping == nil {
		return groceryapi.GetShoppingProfiledefaultJSONResponse{StatusCode: http.StatusServiceUnavailable, Body: groceryapi.Error{Error: "grocery_api_unavailable"}}, nil
	}
	profile, err := api.shopping.ShoppingProfile(ctx, userID)
	if err != nil {
		status, body := groceryErrorResponse(err)
		return groceryapi.GetShoppingProfiledefaultJSONResponse{StatusCode: status, Body: body}, nil
	}
	return groceryapi.GetShoppingProfile200JSONResponse(toAPIShoppingProfile(profile)), nil
}

func (api *groceryAPI) currentShoppingTime() time.Time {
	now := api.currentTime()
	if now.IsZero() {
		now = time.Now()
	}
	return now.UTC()
}

func toAPIPantryItems(values []groceries.PantryItem) []groceryapi.PantryItem {
	if values == nil {
		return nil
	}
	items := make([]groceryapi.PantryItem, len(values))
	for index, value := range values {
		items[index] = groceryapi.PantryItem{Name: value.Name, Quantity: value.Quantity, AddedAt: value.AddedAt, ExpiresAt: value.ExpiresAt}
	}
	return items
}

func toAPIEquipmentItems(values []groceries.EquipmentItem) []groceryapi.EquipmentItem {
	if values == nil {
		return nil
	}
	items := make([]groceryapi.EquipmentItem, len(values))
	for index, value := range values {
		items[index] = groceryapi.EquipmentItem{Name: value.Name, Category: value.Category, AddedAt: value.AddedAt}
	}
	return items
}

func toAPIOrder(value groceries.Order) groceryapi.Order {
	return groceryapi.Order{
		Id: value.ID, Items: toAPIOrderItems(value.Items), TotalItems: value.TotalItems,
		EstimatedTotal: value.EstimatedTotal, PlacedAt: value.PlacedAt, LocationId: value.LocationID, Notes: value.Notes,
	}
}

func toAPIOrders(values []groceries.Order) []groceryapi.Order {
	if values == nil {
		return nil
	}
	orders := make([]groceryapi.Order, len(values))
	for index, value := range values {
		orders[index] = toAPIOrder(value)
	}
	return orders
}

func toAPIOrderItems(values []groceries.OrderItem) []groceryapi.OrderItem {
	if values == nil {
		return nil
	}
	items := make([]groceryapi.OrderItem, len(values))
	for index, value := range values {
		var upc *string
		if value.UPC != "" {
			upc = &value.UPC
		}
		items[index] = groceryapi.OrderItem{Product: toAPIProductReference(value.Product), Upc: upc, Name: value.Name, Quantity: value.Quantity, Price: value.Price}
	}
	return items
}

func toGroceryOrderItems(values []groceryapi.OrderItem) []groceries.OrderItem {
	if values == nil {
		return nil
	}
	items := make([]groceries.OrderItem, len(values))
	for index, value := range values {
		var upc string
		if value.Upc != nil {
			upc = *value.Upc
		}
		items[index] = groceries.OrderItem{Product: toGroceryProductReference(value.Product), UPC: upc, Name: value.Name, Quantity: value.Quantity, Price: value.Price}
	}
	return items
}

func toAPIPreferredStore(value groceries.PreferredStore) groceryapi.PreferredStore {
	return groceryapi.PreferredStore{
		Provider: value.Provider, LocationId: value.LocationID, Name: value.Name, Address: value.Address, Chain: value.Chain, SetAt: value.SetAt,
	}
}

func toAPIShoppingProfile(value groceries.ShoppingProfile) groceryapi.ShoppingProfile {
	var preferredStore *groceryapi.PreferredStore
	if value.PreferredStore != nil {
		converted := toAPIPreferredStore(*value.PreferredStore)
		preferredStore = &converted
	}
	frequentItems := make([]groceryapi.FrequentItem, len(value.FrequentItems))
	for index, item := range value.FrequentItems {
		var upc *string
		if item.UPC != "" {
			upc = &item.UPC
		}
		frequentItems[index] = groceryapi.FrequentItem{Name: item.Name, Product: toAPIProductReference(item.Product), Upc: upc, Orders: item.Orders, TotalQuantity: item.TotalQuantity}
	}
	if value.FrequentItems == nil {
		frequentItems = nil
	}
	return groceryapi.ShoppingProfile{
		PreferredStore: preferredStore,
		Pantry:         toAPIPantryItems(value.Pantry),
		Equipment:      toAPIEquipmentItems(value.Equipment),
		RecentOrders:   toAPIOrders(value.RecentOrders),
		FrequentItems:  frequentItems,
	}
}
