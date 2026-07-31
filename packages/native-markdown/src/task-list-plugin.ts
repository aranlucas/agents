import type MarkdownIt from "markdown-it";

const TASK_MARKER = /^\[([ xX])\][\t ]+/u;

/** Adds renderable checkbox tokens to GFM-style task list items. */
export function taskListPlugin(markdownIt: InstanceType<typeof MarkdownIt>): void {
  markdownIt.core.ruler.after("inline", "native_markdown_task_lists", (state) => {
    let insideListItem = false;

    for (const token of state.tokens) {
      if (token.type === "list_item_open") {
        insideListItem = true;
        continue;
      }
      if (token.type === "list_item_close") {
        insideListItem = false;
        continue;
      }
      if (!insideListItem || token.type !== "inline" || !token.children) continue;

      const marker = TASK_MARKER.exec(token.content);
      const firstText = token.children.find((child) => child.type === "text");
      if (!marker || !firstText || !firstText.content.startsWith(marker[0])) continue;

      token.content = token.content.slice(marker[0].length);
      firstText.content = firstText.content.slice(marker[0].length);

      const checkbox = new state.Token("checkbox", "", 0);
      checkbox.content = marker[1]?.toLowerCase() === "x" ? "true" : "false";
      checkbox.block = false;
      token.children.unshift(checkbox);
    }
    return true;
  });
}
