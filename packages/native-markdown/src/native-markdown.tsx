import { memo, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Markdown, {
  MarkdownIt,
  type MarkdownProps,
  type RenderRules,
} from "react-native-markdown-display";
import remend from "remend";

import { splitMarkdownBlocks } from "./blocks";
import { StreamingCursor } from "./cursor";
import { createMarkdownRules, markdownRules } from "./rules";
import { taskListPlugin } from "./task-list-plugin";

export type NativeMarkdownStyle = NonNullable<MarkdownProps["style"]>;

export type NativeMarkdownProps = {
  children: string;
  cursor?: boolean;
  isStreaming?: boolean;
  maxBlocks?: number;
  onLinkPress?: (url: string) => boolean;
  selectable?: boolean;
  style?: NativeMarkdownStyle;
};

const markdownIt = new MarkdownIt({ typographer: true }).use(taskListPlugin);
const nonSelectableMarkdownRules = createMarkdownRules(false);

type MarkdownBlockProps = {
  children: string;
  markdownRules: RenderRules;
  onLinkPress: (url: string) => boolean;
  style: NativeMarkdownStyle;
};

const MarkdownBlock = memo(function MarkdownBlock({
  children,
  markdownRules: rules,
  onLinkPress,
  style,
}: MarkdownBlockProps) {
  return (
    <Markdown markdownit={markdownIt} onLinkPress={onLinkPress} rules={rules} style={style}>
      {children}
    </Markdown>
  );
});

export const NativeMarkdown = memo(function NativeMarkdown({
  children,
  cursor = false,
  isStreaming = false,
  maxBlocks,
  onLinkPress = safeLink,
  selectable = true,
  style,
}: NativeMarkdownProps) {
  const mergedStyle = useMemo(() => mergeStyles(style), [style]);
  const blocks = useMemo(
    () => prepareMarkdownBlocks(children, maxBlocks, isStreaming),
    [children, isStreaming, maxBlocks],
  );
  const rules = selectable ? markdownRules : nonSelectableMarkdownRules;

  if (blocks.length === 0) return null;

  return (
    <View>
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          markdownRules={rules}
          onLinkPress={onLinkPress}
          style={mergedStyle}
        >
          {block}
        </MarkdownBlock>
      ))}
      {isStreaming && cursor ? <StreamingCursor /> : null}
    </View>
  );
});

export function prepareMarkdownBlocks(
  markdown: string,
  maxBlocks?: number,
  isStreaming = false,
): string[] {
  const blocks = splitMarkdownBlocks(markdown);
  const visibleBlocks = maxBlocks && maxBlocks > 0 ? blocks.slice(0, maxBlocks) : blocks;
  if (!isStreaming || visibleBlocks.length === 0) return visibleBlocks;

  const repairedBlocks = [...visibleBlocks];
  const lastIndex = repairedBlocks.length - 1;
  repairedBlocks[lastIndex] = remend(repairedBlocks[lastIndex] ?? "");
  return repairedBlocks;
}

const monospaceFont = Platform.select({ ios: "Menlo", default: "monospace" });

const baseStyle: NativeMarkdownStyle = {
  body: { color: "#111111", flexShrink: 1, fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  heading1: { fontSize: 24, lineHeight: 30, marginTop: 4, marginBottom: 8 },
  heading2: { fontSize: 21, lineHeight: 27, marginTop: 4, marginBottom: 8 },
  heading3: { fontSize: 18, lineHeight: 24, marginTop: 2, marginBottom: 6 },
  heading4: { fontSize: 16, lineHeight: 22, marginTop: 2, marginBottom: 6 },
  heading5: { fontSize: 15, lineHeight: 21, marginTop: 2, marginBottom: 6 },
  heading6: { fontSize: 14, lineHeight: 20, marginTop: 2, marginBottom: 6 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  blockquote: { borderColor: "#d8d8d8", marginLeft: 0, paddingHorizontal: 10 },
  checkbox: { color: "#666666" },
  code_inline: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    fontFamily: monospaceFont,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  code_block: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    borderRadius: 8,
    fontFamily: monospaceFont,
    overflow: "hidden",
    padding: 10,
  },
  fence: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    borderRadius: 8,
    fontFamily: monospaceFont,
    overflow: "hidden",
    padding: 10,
  },
  codeLanguage: {
    color: "#666666",
    fontFamily: monospaceFont,
    fontSize: 12,
    marginBottom: 6,
  },
  link: { color: "#1268b3" },
  tableScroller: { maxWidth: "100%", marginBottom: 8 },
  table: { borderColor: "#d8d8d8", borderRadius: 8, overflow: "hidden" },
  thead: { backgroundColor: "#e8e8e8" },
  tr: { borderColor: "#d8d8d8" },
  th: { fontWeight: "600", paddingHorizontal: 8, paddingVertical: 4 },
  td: { paddingHorizontal: 8, paddingVertical: 4 },
};

function mergeStyles(style?: NativeMarkdownStyle): NativeMarkdownStyle {
  if (!style) return baseStyle;

  const merged: NativeMarkdownStyle = { ...baseStyle };
  for (const [key, value] of Object.entries(style)) {
    merged[key] = StyleSheet.flatten([baseStyle[key], value]);
  }
  return merged;
}

function safeLink(url: string): boolean {
  return /^(?:https?:|mailto:)/iu.test(url);
}
