import type { ReactElement } from "react";
import { isValidElement } from "react";
import type { ASTNode } from "react-native-markdown-display";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-markdown-display", async () => {
  const { default: MarkdownIt } = await import("markdown-it");
  const textStyleProps = ["color", "fontFamily", "fontSize", "fontWeight", "lineHeight"];
  return {
    default: () => null,
    MarkdownIt,
    removeTextStyleProps: (style: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(style).filter(([key]) => !textStyleProps.includes(key))),
    textStyleProps,
  };
});

import { prepareMarkdownBlocks } from "./native-markdown";
import { createMarkdownRules, markdownRules } from "./rules";

describe("NativeMarkdown table rendering", () => {
  it("wraps tables in a nested horizontal scroll view", () => {
    const node = { key: "table-1" } as ASTNode;
    const result = markdownRules.table?.(node, ["table contents"], [], {
      tableScroller: {},
      _VIEW_SAFE_table: {},
    });

    expect(isValidElement(result)).toBe(true);
    const table = result as ReactElement<{
      children: ReactElement;
      horizontal: boolean;
      nestedScrollEnabled: boolean;
      style: unknown[];
    }>;
    expect(table.type).toBe("ScrollView");
    expect(table.props.horizontal).toBe(true);
    expect(table.props.nestedScrollEnabled).toBe(true);
    expect(table.props.style).toContainEqual({ flexGrow: 0 });
    expect(table.props.children.type).toBe("View");
  });

  it("sizes each column consistently from its widest content", () => {
    const shortHeader = astNode("th", "short-header", "Item");
    const wideHeader = astNode("th", "wide-header", "Notes");
    const shortCell = astNode("td", "short-cell", "Milk");
    const wideCell = astNode(
      "td",
      "wide-cell",
      "A much longer description that needs additional column width",
    );
    const headerRow = astNode("tr", "header-row", "", [shortHeader, wideHeader]);
    const bodyRow = astNode("tr", "body-row", "", [shortCell, wideCell]);
    const head = astNode("thead", "head", "", [headerRow]);
    const body = astNode("tbody", "body", "", [bodyRow]);
    const tableNode = astNode("table", "table", "", [head, body]);
    const styles = { _VIEW_SAFE_th: {}, _VIEW_SAFE_td: {} };

    const header = markdownRules.th?.(shortHeader, ["Item"], [headerRow, head, tableNode], styles);
    const cell = markdownRules.td?.(shortCell, ["Milk"], [bodyRow, body, tableNode], styles);
    const wide = markdownRules.td?.(wideCell, ["Description"], [bodyRow, body, tableNode], styles);
    const headerDimensions = cellDimensions(header);
    const cellDimensionsValue = cellDimensions(cell);
    const wideDimensions = cellDimensions(wide);

    expect(headerDimensions).toEqual(cellDimensionsValue);
    expect(headerDimensions.minWidth).toBeGreaterThanOrEqual(112);
    expect(wideDimensions.minWidth).toBeGreaterThan(headerDimensions.minWidth as number);
    expect(wideDimensions.flexShrink).toBe(0);
  });

  it("honors GFM column alignment on cells", () => {
    const centered = astNode("td", "centered", "Qty", [], { style: "text-align:center" });
    const righted = astNode("td", "righted", "9.99", [], { style: "text-align:right" });
    const plain = astNode("td", "plain", "Milk");
    const row = astNode("tr", "row", "", [centered, righted, plain]);
    const body = astNode("tbody", "body", "", [row]);
    const tableNode = astNode("table", "table", "", [body]);
    const styles = { _VIEW_SAFE_td: {} };

    const centeredCell = markdownRules.td?.(centered, [], [row, body, tableNode], styles);
    const rightCell = markdownRules.td?.(righted, [], [row, body, tableNode], styles);
    const plainCell = markdownRules.td?.(plain, [], [row, body, tableNode], styles);

    expect(cellDimensions(centeredCell).alignItems).toBe("center");
    expect(cellDimensions(rightCell).alignItems).toBe("flex-end");
    expect(cellDimensions(plainCell).alignItems).toBeUndefined();
  });

  it("drops the bottom border on the table's last row", () => {
    const headerRow = astNode("tr", "header-row", "");
    const firstRow = astNode("tr", "first-row", "");
    const lastRow = astNode("tr", "last-row", "");
    const head = astNode("thead", "head", "", [headerRow]);
    const body = astNode("tbody", "body", "", [firstRow, lastRow]);
    const tableNode = astNode("table", "table", "", [head, body]);
    const styles = { _VIEW_SAFE_tr: {} };

    const first = markdownRules.tr?.(firstRow, [], [body, tableNode], styles) as ReactElement<{
      style: unknown[];
    }>;
    const last = markdownRules.tr?.(lastRow, [], [body, tableNode], styles) as ReactElement<{
      style: unknown[];
    }>;

    expect(first.props.style[1]).toBeFalsy();
    expect(last.props.style[1]).toEqual({ borderBottomWidth: 0 });
  });

  it("widens columns for emoji and CJK content", () => {
    const styles = { _VIEW_SAFE_td: {} };
    const buildTable = (text: string, prefix: string) => {
      const cell = astNode("td", `${prefix}-cell`, text);
      const row = astNode("tr", `${prefix}-row`, "", [cell]);
      const body = astNode("tbody", `${prefix}-body`, "", [row]);
      const tableNode = astNode("table", `${prefix}-table`, "", [body]);
      return { cell, parents: [row, body, tableNode] };
    };

    const ascii = buildTable("apples and pears jam", "ascii");
    const emoji = buildTable("🍎🍐🍞🥛🧀🍗🍚🥦🥕🧅🍋🍊🍇🫐🍓🥔🌽🍅🥬🥒", "emoji");
    const asciiCell = markdownRules.td?.(ascii.cell, [], ascii.parents, styles);
    const emojiCell = markdownRules.td?.(emoji.cell, [], emoji.parents, styles);

    expect(cellDimensions(emojiCell).width as number).toBeGreaterThan(
      cellDimensions(asciiCell).width as number,
    );
  });
});

describe("NativeMarkdown rendering rules", () => {
  it("makes text selectable by default and supports opting out", () => {
    const node = astNode("textgroup", "textgroup", "");
    const selectable = markdownRules.textgroup?.(node, ["Text"], [], { textgroup: {} });
    const notSelectable = createMarkdownRules(false).textgroup?.(node, ["Text"], [], {
      textgroup: {},
    });

    expect(elementProps(selectable).selectable).toBe(true);
    expect(elementProps(notSelectable).selectable).toBe(false);
  });

  it("renders checkbox tokens as selectable glyphs", () => {
    const checked = markdownRules.checkbox?.(astNode("checkbox", "checked", "true"), [], [], {
      checkbox: {},
    });
    const unchecked = markdownRules.checkbox?.(astNode("checkbox", "unchecked", "false"), [], [], {
      checkbox: {},
    });

    expect(elementProps(checked).children).toBe("☑ ");
    expect(elementProps(checked).selectable).toBe(true);
    expect(elementProps(unchecked).children).toBe("☐ ");
  });

  it("renders fenced code in a labeled horizontal scroller with split styles", () => {
    const node = {
      ...astNode("fence", "fence", "const value = 1;\n"),
      sourceInfo: "typescript",
    } as ASTNode;
    const result = markdownRules.fence?.(node, [], [], {
      codeLanguage: { fontSize: 12 },
      codeScroller: { maxWidth: "100%" },
      fence: { backgroundColor: "gray", fontFamily: "monospace", padding: 10 },
    });
    const fence = result as ReactElement<{
      children: ReactElement<Record<string, unknown>>[];
      style: Record<string, unknown>;
    }>;
    const [label, scroller] = fence.props.children;
    const code = scroller?.props.children as ReactElement<{
      children: string;
      selectable: boolean;
      style: Record<string, unknown>[];
    }>;

    expect(fence.type).toBe("View");
    expect(fence.props.style).toEqual({ backgroundColor: "gray", padding: 10 });
    expect(label?.type).toBe("Text");
    expect(label?.props.children).toBe("typescript");
    expect(scroller?.type).toBe("ScrollView");
    expect(scroller?.props.horizontal).toBe(true);
    expect(scroller?.props.nestedScrollEnabled).toBe(true);
    expect(code.type).toBe("Text");
    expect(code.props.children).toBe("const value = 1;");
    expect(code.props.selectable).toBe(true);
    expect(code.props.style[1]).toEqual({ fontFamily: "monospace" });
  });

  it("converts ordered-list starts to numbers before adding the item index", () => {
    const item = astNode("list_item", "item", "");
    item.index = 0;
    item.markup = ".";
    const orderedList = astNode("ordered_list", "ordered", "", [], { start: "2" });
    const result = markdownRules.list_item?.(item, ["Second"], [orderedList], {
      _VIEW_SAFE_list_item: {},
      _VIEW_SAFE_ordered_list_content: {},
      list_item: {},
      ordered_list_icon: {},
    }) as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
    const icon = result.props.children[0];

    expect(icon?.props.children).toEqual([2, "."]);
  });
});

describe("NativeMarkdown streaming preparation", () => {
  it("applies remend to the last block only while streaming", () => {
    expect(prepareMarkdownBlocks("**complete**\n\n**partial", undefined, true)).toEqual([
      "**complete**",
      "**partial**",
    ]);
    expect(prepareMarkdownBlocks("**complete**\n\n**partial", undefined, false)).toEqual([
      "**complete**",
      "**partial",
    ]);
  });
});

function astNode(
  type: string,
  key: string,
  content: string,
  children: ASTNode[] = [],
  attributes: Record<string, string> = {},
): ASTNode {
  return {
    type,
    sourceType: type,
    key,
    content,
    markup: "",
    tokenIndex: 0,
    index: 0,
    attributes,
    children,
  };
}

function cellDimensions(value: unknown): Record<string, unknown> {
  const element = value as ReactElement<{ style: Record<string, unknown>[] }>;
  return element.props.style[1];
}

function elementProps(value: unknown): Record<string, unknown> {
  return (value as ReactElement<Record<string, unknown>>).props;
}
