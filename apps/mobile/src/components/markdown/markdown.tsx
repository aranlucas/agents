import { memo } from "react";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Extension } from "mdast-util-from-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import ASTRenderer from "./ast-renderer";
import type { MarkdownProps } from "./types";
import { getKeyFromMarkdown, resolveReference } from "./utils";

// Stable default so the memoized component doesn't re-render on a fresh `[]`.
const NO_EXTENSIONS: Extension[] = [];

const Markdown = memo(
  ({
    markdown,
    debug,
    renderRules,
    listBulletStyle,
    styles,
    mergeStyle,
    customBulletElement,
    onLinkPress,
    extensions = NO_EXTENSIONS,
  }: MarkdownProps) => {
    const tree = fromMarkdown(markdown, {
      extensions: [gfmTable()],
      mdastExtensions: [
        gfmTableFromMarkdown(),
        resolveReference(),
        getKeyFromMarkdown(),
        ...extensions,
      ],
    });

    const renderer = new ASTRenderer({
      renderRules,
      debug,
      styles,
      mergeStyle,
      listBulletStyle,
      customBulletElement,
      onLinkPress,
    });

    return renderer.render(tree);
  },
);

Markdown.displayName = "Markdown";
export default Markdown;
