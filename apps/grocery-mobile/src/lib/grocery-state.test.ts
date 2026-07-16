import { describe, expect, it } from "vitest";
import {
  cartSubtotal,
  normalizeGroceryState,
  pantryNames,
  toDisplayMessage,
  toDisplayMessages,
} from "./grocery-state";

describe("grocery state", () => {
  it("normalizes the streamed grocery contract", () => {
    expect(
      normalizeGroceryState({
        shopping_list: ["milk", 3, "eggs"],
        product_matches: [
          {
            query: "milk",
            name: "Kroger Whole Milk",
            upc: "0001111041700",
            image_url: "https://www.kroger.com/product/images/thumbnail/front/0001111041700",
            price: 3.5,
            size: "1 gal",
          },
          { query: "eggs", name: "Bad image", upc: "0001111000011", image_url: "http://x" },
        ],
        cart: [{ name: "Milk", quantity: 2, price: 3.5 }, { nope: true }],
        pantry: [{ name: "Salt", quantity: "1 jar" }],
        status: "ready",
        kroger_connected: true,
      }),
    ).toMatchObject({
      shopping_list: ["milk", "eggs"],
      product_matches: [
        {
          query: "milk",
          name: "Kroger Whole Milk",
          upc: "0001111041700",
          image_url: "https://www.kroger.com/product/images/thumbnail/front/0001111041700",
          price: 3.5,
          size: "1 gal",
        },
      ],
      cart: [{ name: "Milk", quantity: 2, price: 3.5 }],
      pantry: [{ name: "Salt", quantity: "1 jar" }],
      status: "ready",
      kroger_connected: true,
    });
  });

  it("extracts text parts while ignoring tool-only messages", () => {
    expect(
      toDisplayMessage(
        { id: "m1", role: "assistant", content: [{ type: "text", text: "List ready" }] },
        0,
      ),
    ).toEqual({ id: "m1", role: "assistant", content: "List ready" });
    expect(toDisplayMessage({ role: "tool", content: "hidden" }, 1)).toBeNull();
  });

  it("derives the latest text when a streamed message is mutated in place", () => {
    const messages = [{ id: "m1", role: "assistant", content: "Building" }];

    expect(toDisplayMessages(messages)[0]?.content).toBe("Building");
    messages[0].content += " your list";
    expect(toDisplayMessages(messages)[0]?.content).toBe("Building your list");
  });

  it("calculates quantities and normalizes pantry lookup", () => {
    expect(cartSubtotal([{ name: "Milk", quantity: 2, price: 3.5 }])).toBe(7);
    expect(pantryNames([{ name: " Sea Salt ", quantity: "1" }]).has("sea salt")).toBe(true);
  });
});
