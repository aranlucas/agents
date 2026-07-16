import {
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import {
  removeTextStyleProps,
  textStyleProps,
  type ASTNode,
  type RenderFunction,
  type RenderRules,
} from "react-native-markdown-display";

export function createMarkdownRules(selectable = true): RenderRules {
  return {
    table: (node, children, _parentNodes, styles) => (
      <ScrollView
        horizontal
        key={node.key}
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={[styles.tableScroller, tableScrollerLayoutStyle]}
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
      <View
        key={node.key}
        style={[styles._VIEW_SAFE_th, tableCellStyle(node, parentNodes, styles)]}
      >
        {children}
      </View>
    ),
    td: (node, children, parentNodes, styles) => (
      <View
        key={node.key}
        style={[styles._VIEW_SAFE_td, tableCellStyle(node, parentNodes, styles)]}
      >
        {children}
      </View>
    ),
    textgroup: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.textgroup}>
        {children}
      </Text>
    ),
    code_inline: (node, _children, _parentNodes, styles, inheritedStyles = {}) => (
      <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.code_inline]}>
        {node.content}
      </Text>
    ),
    code_block: codeBlockRule("code_block", selectable),
    fence: codeBlockRule("fence", selectable),
    checkbox: (node, _children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.checkbox}>
        {node.content === "true" ? "☑ " : "☐ "}
      </Text>
    ),
    list_item: listItemRule,
  };
}

function codeBlockRule(styleKey: "code_block" | "fence", selectable: boolean): RenderFunction {
  return (node, _children, _parentNodes, styles, inheritedStyles = {}) => {
    const flattenedStyle: Record<string, unknown> = StyleSheet.flatten(styles[styleKey]) ?? {};
    const containerStyle = removeTextStyleProps(flattenedStyle);
    const textStyle = pickTextStyle(flattenedStyle);
    const language = styleKey === "fence" ? sourceInfo(node).trim() : "";

    return (
      <View key={node.key} style={containerStyle}>
        {language ? <Text style={styles.codeLanguage}>{language}</Text> : null}
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.codeScroller}
        >
          <Text selectable={selectable} style={[inheritedStyles, textStyle]}>
            {trimTrailingNewline(node.content)}
          </Text>
        </ScrollView>
      </View>
    );
  };
}

const listItemRule: RenderFunction = (
  node,
  children,
  parentNodes,
  styles,
  inheritedStyles = {},
) => {
  const inherited: Record<string, unknown> = inheritedStyles;
  const listItemStyle: Record<string, unknown> = StyleSheet.flatten(styles.list_item) ?? {};
  const refStyle = { ...inherited, ...listItemStyle };
  const inheritedTextStyle = pickTextStyle(refStyle);

  if (hasParent(parentNodes, "bullet_list")) {
    return (
      <View key={node.key} style={styles._VIEW_SAFE_list_item}>
        <Text accessible={false} style={[inheritedTextStyle, styles.bullet_list_icon]}>
          {Platform.select({ android: "•", ios: "·", default: "•" })}
        </Text>
        <View style={styles._VIEW_SAFE_bullet_list_content}>{children}</View>
      </View>
    );
  }

  const orderedList = parentNodes.find((parent) => parent.type === "ordered_list");
  if (orderedList) {
    const listItemNumber = Number(orderedList.attributes?.start ?? 1) + node.index;
    return (
      <View key={node.key} style={styles._VIEW_SAFE_list_item}>
        <Text style={[inheritedTextStyle, styles.ordered_list_icon]}>
          {listItemNumber}
          {node.markup}
        </Text>
        <View style={styles._VIEW_SAFE_ordered_list_content}>{children}</View>
      </View>
    );
  }

  return (
    <View key={node.key} style={styles._VIEW_SAFE_list_item}>
      {children}
    </View>
  );
};

function hasParent(parentNodes: ASTNode[], type: string): boolean {
  return parentNodes.some((parent) => parent.type === type);
}

function pickTextStyle(style: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(style).filter(([property]) => textStyleProps.includes(property)),
  );
}

function sourceInfo(node: ASTNode): string {
  return ((node as ASTNode & { sourceInfo?: string }).sourceInfo ?? "").trim();
}

function trimTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

const MIN_TABLE_COLUMN_WIDTH = 112;
const MAX_TABLE_COLUMN_WIDTH = 320;
const CHARACTER_WIDTH_PER_FONT_SIZE = 0.5;
const DEFAULT_BODY_FONT_SIZE = 15;
const TABLE_CELL_HORIZONTAL_PADDING = 20;
const tableScrollerLayoutStyle: ViewStyle = { flexGrow: 0 };
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
  for (const character of line) units += wideCharacterPattern.test(character) ? 2 : 1;
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

function visitTableRows(node: ASTNode, visit: (row: ASTNode) => void): void {
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

export const markdownRules = createMarkdownRules();
