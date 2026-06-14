import { describe, expect, it } from "vitest";

import { getMergedStyles, getKeyFromMarkdown, resolveReference } from "./utils";

describe("getMergedStyles", () => {
  it("produces a _VIEW_SAFE_ variant that strips text-only props for every key", () => {
    const merged = getMergedStyles();

    // The default `text` style has a font size; the view-safe variant must drop it.
    const viewSafeParagraph = merged._VIEW_SAFE_paragraph as Record<string, unknown>;
    expect(merged.paragraph).toBeDefined();
    expect(viewSafeParagraph).toBeDefined();
    expect("fontSize" in viewSafeParagraph).toBe(false);

    const viewSafeHeading = merged._VIEW_SAFE_heading1 as Record<string, unknown>;
    expect("fontSize" in viewSafeHeading).toBe(false);
    expect("fontWeight" in viewSafeHeading).toBe(false);
  });

  it("keeps view-layout props in the _VIEW_SAFE_ variant", () => {
    const merged = getMergedStyles();
    const viewSafeThematicBreak = merged._VIEW_SAFE_thematicBreak as Record<string, unknown>;
    // height/backgroundColor are view props and should survive.
    expect(viewSafeThematicBreak.height).toBe(1);
    expect(viewSafeThematicBreak.backgroundColor).toBe("#0000006c");
  });

  it("merges custom overrides over defaults when merge=true", () => {
    const merged = getMergedStyles({ paragraph: { marginVertical: 99 } }, true);
    const paragraph = merged.paragraph as Record<string, unknown>;
    expect(paragraph.marginVertical).toBe(99);
    // A default prop not overridden is preserved.
    expect(paragraph.flexDirection).toBe("row");
  });

  it("replaces instead of merging when merge=false", () => {
    const merged = getMergedStyles({ paragraph: { marginVertical: 99 } }, false);
    const paragraph = merged.paragraph as Record<string, unknown>;
    expect(paragraph.marginVertical).toBe(99);
    // Defaults are not merged in when merge=false.
    expect(paragraph.flexDirection).toBeUndefined();
  });
});

describe("getKeyFromMarkdown", () => {
  it("assigns position-derived keys to nodes recursively", () => {
    const ext = getKeyFromMarkdown();
    const transform = ext.transforms?.[0];
    expect(transform).toBeDefined();

    // eslint-disable-next-line typescript/no-explicit-any
    const tree: any = {
      type: "root",
      position: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      children: [
        {
          type: "paragraph",
          position: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
          children: [],
        },
      ],
    };

    transform!(tree, {} as never);
    expect(tree.key).toBe("root-1:1-2:1");
    expect(tree.children[0].key).toBe("paragraph-1:1-1:5");
  });
});

describe("resolveReference", () => {
  it("rewrites link references into links and removes definitions", () => {
    const ext = resolveReference();
    const transform = ext.transforms?.[0];
    expect(transform).toBeDefined();

    // eslint-disable-next-line typescript/no-explicit-any
    const tree: any = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "linkReference", identifier: "ref", children: [] }],
        },
        { type: "definition", identifier: "ref", url: "https://example.com", title: "Example" },
      ],
    };

    transform!(tree, {} as never);

    const link = tree.children[0].children[0];
    expect(link.type).toBe("link");
    expect(link.url).toBe("https://example.com");
    expect(link.title).toBe("Example");
    // The definition node is stripped from the tree.
    expect(tree.children).toHaveLength(1);
  });

  it("does nothing when there are no definitions", () => {
    const ext = resolveReference();
    const transform = ext.transforms?.[0];
    // eslint-disable-next-line typescript/no-explicit-any
    const tree: any = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "hi" }] }],
    };
    transform!(tree, {} as never);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].children[0].type).toBe("text");
  });
});
