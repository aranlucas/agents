import { describe, expect, it } from "vitest";
import { suggestionKey, uniqueSuggestions } from "./grocery-suggestions";

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
