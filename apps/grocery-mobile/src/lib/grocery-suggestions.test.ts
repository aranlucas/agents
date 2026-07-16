import { describe, expect, it } from "vitest";
import { GROCERY_SUGGESTION_THEMES, suggestionKey, uniqueSuggestions } from "./grocery-suggestions";

describe("GROCERY_SUGGESTION_THEMES", () => {
  it("provides distinct, ready-to-send prompts without generation", () => {
    expect(GROCERY_SUGGESTION_THEMES).toHaveLength(3);
    expect(uniqueSuggestions(GROCERY_SUGGESTION_THEMES)).toEqual(GROCERY_SUGGESTION_THEMES);
    expect(
      GROCERY_SUGGESTION_THEMES.every(
        (suggestion) =>
          suggestion.title.length > 0 && suggestion.message.length > 0 && !suggestion.isLoading,
      ),
    ).toBe(true);
  });
});

describe("uniqueSuggestions", () => {
  it("removes exact duplicate suggestions", () => {
    expect(
      uniqueSuggestions([
        { title: "Plan dinners", message: "Plan five easy dinners under $100" },
        { title: "Plan dinners", message: "Plan five easy dinners under $100" },
      ]),
    ).toEqual([{ title: "Plan dinners", message: "Plan five easy dinners under $100" }]);
  });

  it("keeps suggestions with the same title and different prompts", () => {
    const suggestions = [
      { title: "Plan dinners", message: "Plan five easy dinners under $100" },
      { title: "Plan dinners", message: "Plan three vegetarian dinners" },
    ];

    expect(uniqueSuggestions(suggestions)).toEqual(suggestions);
    expect(suggestionKey(suggestions[0])).not.toBe(suggestionKey(suggestions[1]));
  });
});
