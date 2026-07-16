package grocery

import (
	"errors"
	"testing"
)

func TestGroceryCartUpdateRequiresConnectedState(t *testing.T) {
	state := newGroceryState(false)
	_, err := updateCart(&state, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 1, Price: 4.29, UPC: "00011110042908"}}})
	if !errors.Is(err, ErrKrogerDisconnected) {
		t.Fatalf("error = %v", err)
	}
	if len(state.Cart) != 0 {
		t.Fatal("disconnected cart update mutated state")
	}
}

func TestGroceryShoppingListAndLiveCartRemainDistinct(t *testing.T) {
	state := newGroceryState(true)
	state.ShoppingList = []string{"2x milk", "eggs"}
	cart, err := updateCart(&state, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 2, Price: 4.29, UPC: "00011110042908"}}})
	if err != nil || !cart.OK || len(state.ShoppingList) != 2 || len(state.Cart) != 1 || state.Cart[0].UPC != "00011110042908" {
		t.Fatalf("cart/state/error = %#v / %#v / %v", cart, state, err)
	}
}

func TestGroceryProductMatchesPreserveKrogerImages(t *testing.T) {
	state := newGroceryState(true)
	result, err := setProductMatches(&state, ProductMatchesArgs{Items: []ProductMatch{{
		Query: "milk", Name: "Kroger Whole Milk", UPC: "0001111041700",
		ImageURL: "https://www.kroger.com/product/images/thumbnail/front/0001111041700",
		Price:    3.99, Size: "1 gal",
	}}})
	if err != nil || !result.OK || len(state.ProductMatches) != 1 || state.ProductMatches[0].ImageURL == "" {
		t.Fatalf("result/state/error = %#v / %#v / %v", result, state, err)
	}
}

func TestGroceryProductMatchesRejectNonKrogerImagesTransactionally(t *testing.T) {
	state := newGroceryState(true)
	state.ProductMatches = []ProductMatch{{Query: "eggs", Name: "Eggs", UPC: "0001111000011"}}
	result, err := setProductMatches(&state, ProductMatchesArgs{Items: []ProductMatch{{
		Query: "milk", Name: "Milk", UPC: "0001111041700", ImageURL: "https://example.com/milk.jpg",
	}}})
	if err != nil || result.OK || result.Error == nil || len(state.ProductMatches) != 1 || state.ProductMatches[0].Query != "eggs" {
		t.Fatalf("result/state/error = %#v / %#v / %v", result, state, err)
	}
}

func TestGroceryRejectsInvalidCartAndPantryDataTransactionally(t *testing.T) {
	state := newGroceryState(true)
	badCart, _ := updateCart(&state, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 0, Price: 1, UPC: "not-a-upc"}}})
	expiry := "07/10/2026"
	badPantry, _ := updatePantry(&state, PantryArgs{Items: []PantryItem{{Name: "Milk", Quantity: "1", Expires: &expiry}}})
	if badCart.OK || badCart.Error == nil || badPantry.OK || badPantry.Error == nil || len(state.Cart) != 0 || len(state.Pantry) != 0 {
		t.Fatalf("results/state = %#v / %#v / %#v", badCart, badPantry, state)
	}
}

func TestGroceryMealPlanIsStreamedStateTarget(t *testing.T) {
	state := newGroceryState(true)
	result, _ := setMealPlan(&state, MealPlanArgs{Plan: "## Day 1: Strength\n- Dinner: salmon bowl"})
	if !result.OK || state.MealPlan == "" || state.Status != StatusPlanning {
		t.Fatalf("result/state = %#v / %#v", result, state)
	}
}

func newGroceryState(connected bool) GroceryState {
	state := Defaults()
	state.KrogerConnected = connected
	return state
}
