import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Markdown, { type MarkdownProps, type RenderRules } from "react-native-markdown-display";

export type NativeMarkdownStyle = NonNullable<MarkdownProps["style"]>;

export type NativeMarkdownProps = {
  children: string;
  maxBlocks?: number;
  onLinkPress?: (url: string) => boolean;
  style?: NativeMarkdownStyle;
};

export const markdownRules: RenderRules = {
  table: (node, children, _parentNodes, styles) => (
    <ScrollView
      horizontal
      key={node.key}
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={styles.tableScroller}
    >
      <View style={styles._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
};

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
  code_inline: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  code_block: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    padding: 10,
  },
  fence: {
    backgroundColor: "#e8e8e8",
    borderColor: "#d8d8d8",
    padding: 10,
  },
  link: { color: "#1268b3" },
  tableScroller: { maxWidth: "100%", marginBottom: 8 },
  table: { borderColor: "#d8d8d8", borderRadius: 8 },
  thead: { backgroundColor: "#e8e8e8" },
  tr: { borderColor: "#d8d8d8" },
  th: { flex: 0, width: 148, paddingHorizontal: 10, paddingVertical: 8 },
  td: { flex: 0, width: 148, paddingHorizontal: 10, paddingVertical: 8 },
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

export function limitMarkdownBlocks(markdown: string, maxBlocks?: number): string {
  if (!maxBlocks || maxBlocks < 1) return markdown;
  return markdown
    .trim()
    .split(/\n[\t ]*\n/u)
    .slice(0, maxBlocks)
    .join("\n\n");
}

export function NativeMarkdown({
  children,
  maxBlocks,
  onLinkPress = safeLink,
  style,
}: NativeMarkdownProps) {
  const mergedStyle = useMemo(() => mergeStyles(style), [style]);
  const markdown = useMemo(() => limitMarkdownBlocks(children, maxBlocks), [children, maxBlocks]);

  return (
    <Markdown onLinkPress={onLinkPress} rules={markdownRules} style={mergedStyle}>
      {markdown}
    </Markdown>
  );
}
