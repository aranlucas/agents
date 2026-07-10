package grocery

import (
	"context"
	"errors"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestGroceryCartUpdateRequiresConnectedState(t *testing.T) {
	tx := newGroceryTx(false)
	_, err := UpdateCart(context.Background(), tx, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 1, Price: 4.29, UPC: "00011110042908"}}})
	if !errors.Is(err, ErrKrogerDisconnected) {
		t.Fatalf("error = %v", err)
	}
	if len(decodeState(tx).Cart) != 0 {
		t.Fatal("disconnected cart update mutated state")
	}
}

func TestGroceryShoppingListAndLiveCartRemainDistinct(t *testing.T) {
	tx := newGroceryTx(true)
	list, err := SetShoppingList(context.Background(), tx, ShoppingListArgs{Items: []string{"2x milk", "eggs"}, Notes: "Use deal"})
	if err != nil || !list.OK || len(decodeState(tx).Cart) != 0 {
		t.Fatalf("list/state/error = %#v / %#v / %v", list, decodeState(tx), err)
	}
	cart, err := UpdateCart(context.Background(), tx, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 2, Price: 4.29, UPC: "00011110042908"}}})
	state := decodeState(tx)
	if err != nil || !cart.OK || len(state.ShoppingList) != 2 || len(state.Cart) != 1 || state.Cart[0].UPC != "00011110042908" {
		t.Fatalf("cart/state/error = %#v / %#v / %v", cart, state, err)
	}
}

func TestGroceryRejectsInvalidCartAndPantryDataTransactionally(t *testing.T) {
	tx := newGroceryTx(true)
	badCart, _ := UpdateCart(context.Background(), tx, CartArgs{Items: []CartItem{{Name: "Milk", Quantity: 0, Price: 1, UPC: "not-a-upc"}}})
	expiry := "07/10/2026"
	badPantry, _ := UpdatePantry(context.Background(), tx, PantryArgs{Items: []PantryItem{{Name: "Milk", Quantity: "1", Expires: &expiry}}})
	if badCart.OK || badCart.Error == nil || badPantry.OK || badPantry.Error == nil || len(decodeState(tx).Cart) != 0 || len(decodeState(tx).Pantry) != 0 {
		t.Fatalf("results/state = %#v / %#v / %#v", badCart, badPantry, decodeState(tx))
	}
}

func TestGroceryMealPlanIsStreamedStateTarget(t *testing.T) {
	tx := newGroceryTx(true)
	result, _ := SetMealPlan(context.Background(), tx, MealPlanArgs{Plan: "## Day 1: Strength\n- Dinner: salmon bowl"})
	state := decodeState(tx)
	if !result.OK || state.MealPlan == "" || state.Status != StatusPlanning {
		t.Fatalf("result/state = %#v / %#v", result, state)
	}
}

func newGroceryTx(connected bool) *agentruntime.Transaction {
	state := StateDefaults()
	state["kroger_connected"] = connected
	return agentruntime.NewTransaction(state)
}
