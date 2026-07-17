import { describe, expect, it } from "vitest";
import { GROCERY_SUGGESTIONS } from "@/lib/grocery-suggestions";

describe("GROCERY_SUGGESTIONS", () => {
  it("provides distinct, ready-to-send prompts", () => {
    expect(GROCERY_SUGGESTIONS).toHaveLength(3);
    expect(new Set(GROCERY_SUGGESTIONS.map((suggestion) => suggestion.title)).size).toBe(3);
    expect(
      GROCERY_SUGGESTIONS.every(
        (suggestion) => suggestion.title.length > 0 && suggestion.message.length > 0,
      ),
    ).toBe(true);
  });
});
