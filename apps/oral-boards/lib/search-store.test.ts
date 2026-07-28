import { describe, expect, it } from "vitest";

import { buildFtsQuery, InvalidSearchQueryError, getStore } from "./search-store";

describe("Oral Boards search queries", () => {
  it.each([
    ["pulp therapy?", '"pulp" "therapy"'],
    ["behavior guidance (AAPD)", '"behavior" "guidance" "AAPD"'],
    ["caries-management", '"caries" "management"'],
    ["  space\u00a0maintainer  ", '"space" "maintainer"'],
  ])("turns %j into literal FTS5 terms", (query, expected) => {
    expect(buildFtsQuery(query)).toBe(expected);
  });

  it.each(["???", "()", '* "'])("rejects punctuation-only input %j", (query) => {
    expect(() => buildFtsQuery(query)).toThrow(InvalidSearchQueryError);
  });

  it("bounds query length and term count", () => {
    expect(() => buildFtsQuery("a".repeat(257))).toThrow("256 characters or fewer");
    expect(() =>
      buildFtsQuery(Array.from({ length: 17 }, (_, index) => `term${index}`).join(" ")),
    ).toThrow("at most 16 terms");
  });

  it.each(["pulp therapy?", "behavior guidance (AAPD)", "caries-management"])(
    "executes punctuation-bearing query %j against the committed FTS database",
    async (query) => {
      await expect(getStore().searchLex(query, { limit: 2 })).resolves.toEqual(expect.any(Array));
    },
  );
});
