import { describe, expect, it } from "vitest";

import { limitMarkdownBlocks, splitMarkdownBlocks } from "./blocks";

describe("splitMarkdownBlocks", () => {
  it("keeps fenced code with interior blank lines together", () => {
    expect(
      splitMarkdownBlocks("Before\n\n```ts\nconst one = 1;\n\nconst two = 2;\n```\n\nAfter"),
    ).toEqual(["Before", "```ts\nconst one = 1;\n\nconst two = 2;\n```", "After"]);
  });

  it("keeps an unclosed fence as the final block", () => {
    expect(splitMarkdownBlocks("Before\n\n```ts\nconst one = 1;\n\nstill code")).toEqual([
      "Before",
      "```ts\nconst one = 1;\n\nstill code",
    ]);
  });

  it("supports tilde fences", () => {
    expect(splitMarkdownBlocks("~~~sh\necho one\n\necho two\n~~~\n\nAfter")).toEqual([
      "~~~sh\necho one\n\necho two\n~~~",
      "After",
    ]);
  });

  it("keeps indented list continuations with their list item", () => {
    expect(splitMarkdownBlocks("- Item\n\n  Continued details\n\nNext paragraph")).toEqual([
      "- Item\n\n  Continued details",
      "Next paragraph",
    ]);
  });

  it("allows ordered-list items to split without losing their source start", () => {
    expect(splitMarkdownBlocks("1. First\n\n2. Second")).toEqual(["1. First", "2. Second"]);
  });

  it("normalizes CRLF input", () => {
    expect(splitMarkdownBlocks("First\r\n\r\nSecond\r\nline")).toEqual(["First", "Second\nline"]);
  });
});

describe("limitMarkdownBlocks", () => {
  it("keeps markdown syntax intact when limiting a preview", () => {
    expect(
      limitMarkdownBlocks("**Meal Plan**\n\n**Thursday**\n\n- Breakfast\n- Lunch\n\n**Friday**", 2),
    ).toBe("**Meal Plan**\n\n**Thursday**");
  });

  it("never cuts inside a fenced code block", () => {
    expect(
      limitMarkdownBlocks("Intro\n\n```ts\nconst one = 1;\n\nconst two = 2;\n```\n\nAfter", 2),
    ).toBe("Intro\n\n```ts\nconst one = 1;\n\nconst two = 2;\n```");
  });
});
