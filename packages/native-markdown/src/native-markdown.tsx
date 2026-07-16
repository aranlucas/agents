import { memo, useMemo } from "react";
import { PixelRatio, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import Markdown, {
  type ASTNode,
  type MarkdownProps,
  type RenderRules,
} from "react-native-markdown-display";

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
  tr: (node, children, parentNodes, styles) => (
    <View
      key={node.key}
      style={[styles._VIEW_SAFE_tr, isLastTableRow(node, parentNodes) && lastTableRowStyle]}
    >
      {children}
    </View>
  ),
  th: (node, children, parentNodes, styles) => (
    <View key={node.key} style={[styles._VIEW_SAFE_th, tableCellStyle(node, parentNodes, styles)]}>
      {children}
    </View>
  ),
  td: (node, children, parentNodes, styles) => (
    <View key={node.key} style={[styles._VIEW_SAFE_td, tableCellStyle(node, parentNodes, styles)]}>
      {children}
    </View>
  ),
};

const MIN_TABLE_COLUMN_WIDTH = 112;
const MAX_TABLE_COLUMN_WIDTH = 320;
const CHARACTER_WIDTH_PER_FONT_SIZE = 0.5;
const DEFAULT_BODY_FONT_SIZE = 15;
const TABLE_CELL_HORIZONTAL_PADDING = 20;
const lastTableRowStyle: ViewStyle = { borderBottomWidth: 0 };
const tableColumnWidthsCache = new WeakMap<ASTNode, number[]>();

function tableCellStyle(
  node: ASTNode,
  parentNodes: ASTNode[],
  styles: Record<string, unknown>,
): ViewStyle {
  const row = parentNodes.find((parent) => parent.type === "tr");
  const table = parentNodes.find((parent) => parent.type === "table");
  const columnIndex = row?.children.findIndex((cell) => cell.key === node.key) ?? -1;
  const alignItems = cellAlignment(node);
  if (!table || columnIndex < 0) {
    return { alignItems, flexGrow: 0, flexShrink: 0, minWidth: MIN_TABLE_COLUMN_WIDTH };
  }

  const width = tableColumnWidths(table, styles)[columnIndex] ?? MIN_TABLE_COLUMN_WIDTH;
  return { alignItems, flexGrow: 0, flexShrink: 0, minWidth: width, width };
}

function cellAlignment(node: ASTNode): ViewStyle["alignItems"] {
  const styleAttribute = node.attributes?.style;
  if (typeof styleAttribute !== "string") return undefined;
  const alignment = /text-align:\s*(center|right)/u.exec(styleAttribute)?.[1];
  if (alignment === "center") return "center";
  if (alignment === "right") return "flex-end";
  return undefined;
}

function tableColumnWidths(table: ASTNode, styles: Record<string, unknown>): number[] {
  const cached = tableColumnWidthsCache.get(table);
  if (cached) return cached;

  const longestContentByColumn: number[] = [];
  visitTableRows(table, (row) => {
    const cells = row.children.filter((child) => child.type === "th" || child.type === "td");
    for (const [columnIndex, cell] of cells.entries()) {
      const longestLine = Math.max(
        0,
        ...nodeText(cell)
          .split("\n")
          .map((line) => lineWidthUnits(line.trim())),
      );
      longestContentByColumn[columnIndex] = Math.max(
        longestContentByColumn[columnIndex] ?? 0,
        longestLine,
      );
    }
  });
  const fontScale = PixelRatio.getFontScale();
  const characterWidth = bodyFontSize(styles) * CHARACTER_WIDTH_PER_FONT_SIZE * fontScale;
  const widths = longestContentByColumn.map((longestContent) =>
    Math.min(
      MAX_TABLE_COLUMN_WIDTH * fontScale,
      Math.max(
        MIN_TABLE_COLUMN_WIDTH * fontScale,
        Math.ceil(longestContent * characterWidth + TABLE_CELL_HORIZONTAL_PADDING),
      ),
    ),
  );
  tableColumnWidthsCache.set(table, widths);
  return widths;
}

const wideCharacterPattern = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u;

function lineWidthUnits(line: string): number {
  let units = 0;
  for (const character of line) {
    units += wideCharacterPattern.test(character) ? 2 : 1;
  }
  return units;
}

function bodyFontSize(styles: Record<string, unknown>): number {
  const body = styles.body;
  if (typeof body !== "object" || body === null || !("fontSize" in body)) {
    return DEFAULT_BODY_FONT_SIZE;
  }
  return typeof body.fontSize === "number" ? body.fontSize : DEFAULT_BODY_FONT_SIZE;
}

function isLastTableRow(node: ASTNode, parentNodes: ASTNode[]): boolean {
  const table = parentNodes.find((parent) => parent.type === "table");
  if (!table) return false;
  let lastRow: ASTNode | undefined;
  visitTableRows(table, (row) => {
    lastRow = row;
  });
  return lastRow?.key === node.key;
}

function visitTableRows(node: ASTNode, visit: (row: ASTNode) => void) {
  if (node.type === "tr") {
    visit(node);
    return;
  }
  for (const child of node.children) visitTableRows(child, visit);
}

function nodeText(node: ASTNode): string {
  if (node.content) return node.content;
  return node.children.map(nodeText).join("");
}

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
  table: { borderColor: "#d8d8d8", borderRadius: 8, overflow: "hidden" },
  thead: { backgroundColor: "#e8e8e8" },
  tr: { borderColor: "#d8d8d8" },
  th: { fontWeight: "600", paddingHorizontal: 10, paddingVertical: 8 },
  td: { paddingHorizontal: 10, paddingVertical: 8 },
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

export const NativeMarkdown = memo(function NativeMarkdown({
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
});
