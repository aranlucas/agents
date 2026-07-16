import type { ReactElement } from "react";
import { isValidElement } from "react";
import type { ASTNode } from "react-native-markdown-display";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-markdown-display", () => ({ default: () => null }));

import { limitMarkdownBlocks, markdownRules } from "./native-markdown";

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
    }>;
    expect(table.type).toBe("ScrollView");
    expect(table.props.horizontal).toBe(true);
    expect(table.props.nestedScrollEnabled).toBe(true);
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

  it("keeps markdown syntax intact when limiting a preview", () => {
    expect(
      limitMarkdownBlocks("**Meal Plan**\n\n**Thursday**\n\n- Breakfast\n- Lunch\n\n**Friday**", 2),
    ).toBe("**Meal Plan**\n\n**Thursday**");
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
