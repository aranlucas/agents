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

  it("keeps markdown syntax intact when limiting a preview", () => {
    expect(
      limitMarkdownBlocks("**Meal Plan**\n\n**Thursday**\n\n- Breakfast\n- Lunch\n\n**Friday**", 2),
    ).toBe("**Meal Plan**\n\n**Thursday**");
  });
});
