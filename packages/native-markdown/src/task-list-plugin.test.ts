import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

import { taskListPlugin } from "./task-list-plugin";

describe("taskListPlugin", () => {
  it("replaces task markers with checkbox tokens and strips their text", () => {
    const markdownIt = new MarkdownIt().use(taskListPlugin);
    const inlineTokens = markdownIt
      .parse("- [x] Done\n- [ ] Todo", {})
      .filter((token) => token.type === "inline");

    expect(inlineTokens).toHaveLength(2);
    expect(inlineTokens[0]?.content).toBe("Done");
    expect(inlineTokens[0]?.children?.map(({ type, content }) => [type, content])).toEqual([
      ["checkbox", "true"],
      ["text", "Done"],
    ]);
    expect(inlineTokens[1]?.children?.map(({ type, content }) => [type, content])).toEqual([
      ["checkbox", "false"],
      ["text", "Todo"],
    ]);
  });

  it("leaves task-like text outside list items unchanged", () => {
    const markdownIt = new MarkdownIt().use(taskListPlugin);
    const inline = markdownIt.parse("[x] Not a task", {}).find((token) => token.type === "inline");

    expect(inline?.content).toBe("[x] Not a task");
    expect(inline?.children?.some((token) => token.type === "checkbox")).toBe(false);
  });
});
