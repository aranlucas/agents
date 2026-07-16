import { describe, expect, it } from "vitest";
import {
  cartSubtotal,
  normalizeGroceryState,
  pantryNames,
  stabilizeDisplayMessages,
  stabilizeGroceryState,
  toDisplayMessage,
  toDisplayMessages,
} from "@/lib/grocery-state";

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

  it("extracts display text while ignoring tool-only messages", () => {
    expect(
      toDisplayMessage(
        { id: "m1", role: "assistant", content: [{ type: "text", text: "List ready" }] },
        0,
      ),
    ).toEqual({ id: "m1", role: "assistant", content: "List ready" });
    expect(
      toDisplayMessage({ id: "r1", role: "reasoning", content: "Comparing weekly deals" }, 1),
    ).toEqual({ id: "r1", role: "reasoning", content: "Comparing weekly deals" });
    expect(toDisplayMessage({ role: "tool", content: "hidden" }, 1)).toBeNull();
  });

  it("derives the latest text when a streamed message is mutated in place", () => {
    const messages = [{ id: "m1", role: "assistant", content: "Building" }];

    expect(toDisplayMessages(messages)[0]).toMatchObject({ content: "Building" });
    messages[0].content += " your list";
    expect(toDisplayMessages(messages)[0]).toMatchObject({ content: "Building your list" });
  });

  it("reuses an unchanged normalized state snapshot", () => {
    const previous = normalizeGroceryState({
      shopping_list: ["milk"],
      cart: [{ name: "Milk", quantity: 1, price: 3.5 }],
      status: "planning",
    });
    const equal = normalizeGroceryState({
      shopping_list: ["milk"],
      cart: [{ name: "Milk", quantity: 1, price: 3.5 }],
      status: "planning",
    });
    const changed = normalizeGroceryState({
      shopping_list: ["milk"],
      cart: [{ name: "Milk", quantity: 2, price: 3.5 }],
      status: "planning",
    });

    expect(stabilizeGroceryState(previous, equal)).toBe(previous);
    expect(stabilizeGroceryState(previous, changed)).toBe(changed);
  });

  it("groups consecutive reasoning steps into one collapsible section", () => {
    expect(
      toDisplayMessages([
        { id: "u1", role: "user", content: "Plan dinners" },
        { id: "r1", role: "reasoning", content: "Check weekly deals" },
        { id: "r2", role: "reasoning", content: "Compare pantry items" },
        { id: "a1", role: "assistant", content: "Your plan is ready" },
      ]),
    ).toEqual([
      { id: "u1", role: "user", content: "Plan dinners" },
      {
        id: "r1",
        role: "reasoning",
        content: "Check weekly deals\n\nCompare pantry items",
      },
      { id: "a1", role: "assistant", content: "Your plan is ready" },
    ]);
  });

  it("reuses unchanged display messages across streamed updates", () => {
    const previous = toDisplayMessages([
      { id: "u1", role: "user", content: "Plan dinners" },
      { id: "a1", role: "assistant", content: "Building" },
    ]);
    const next = stabilizeDisplayMessages(
      previous,
      toDisplayMessages([
        { id: "u1", role: "user", content: "Plan dinners" },
        { id: "a1", role: "assistant", content: "Building your list" },
      ]),
    );

    expect(next[0]).toBe(previous[0]);
    expect(next[1]).not.toBe(previous[1]);
    expect(stabilizeDisplayMessages(next, toDisplayMessages(next))).toBe(next);
  });

  it("renders tool calls in message order and pairs their results", () => {
    expect(
      toDisplayMessages([
        { id: "u1", role: "user", content: "Plan dinners" },
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call-1",
              function: { name: "get_current_date", arguments: "{}" },
            },
          ],
        },
        { id: "result-1", role: "tool", toolCallId: "call-1", content: '{"ok":true}' },
        { id: "a2", role: "assistant", content: "It is Wednesday." },
      ]),
    ).toEqual([
      { id: "u1", role: "user", content: "Plan dinners" },
      {
        id: "call-1",
        role: "tool",
        name: "get_current_date",
        parameters: {},
        result: { ok: true },
        status: "complete",
      },
      { id: "a2", role: "assistant", content: "It is Wednesday." },
    ]);
  });

  it("places a grocery-list snapshot beside the tool that marks it ready", () => {
    const items = toDisplayMessages([
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          {
            id: "set-list",
            function: {
              name: "set_shopping_list",
              arguments: '{"items":["milk","eggs"]}',
            },
          },
        ],
      },
      { id: "set-list-result", role: "tool", toolCallId: "set-list", content: '{"ok":true}' },
      {
        id: "a2",
        role: "assistant",
        toolCalls: [
          {
            id: "ready",
            function: {
              name: "mark_list_ready",
              arguments: '{"summary":"Two breakfast staples"}',
            },
          },
        ],
      },
      { id: "ready-result", role: "tool", toolCallId: "ready", content: '{"ok":true}' },
      { id: "a3", role: "assistant", content: "Your list is ready." },
    ]);

    expect(items.map((item) => item.role)).toEqual(["tool", "tool", "grocery-list", "assistant"]);
    expect(items[2]).toMatchObject({
      id: "ready-grocery-list",
      state: {
        shopping_list: ["milk", "eggs"],
        review_summary: "Two breakfast staples",
        status: "ready",
      },
    });
  });

  it("calculates quantities and normalizes pantry lookup", () => {
    expect(cartSubtotal([{ name: "Milk", quantity: 2, price: 3.5 }])).toBe(7);
    expect(pantryNames([{ name: " Sea Salt ", quantity: "1" }]).has("sea salt")).toBe(true);
  });
});
