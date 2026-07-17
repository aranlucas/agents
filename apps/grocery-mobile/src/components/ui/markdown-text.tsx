import { useMemo, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";
import { Check } from "lucide-react-native";
import { parseMarkdown } from "react-native-markdown-stream";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// `react-native-markdown-stream`'s own renderer draws every node with RN's raw `Text`, styled
// through a hand-rolled color-only theme — there's no hook to route paragraphs/headings/lists
// through our design-system `Text` component. So this renders the mdast tree ourselves (using
// only `parseMarkdown`, which also runs the library's streamdown-derived incomplete-markdown
// sanitizer) with the same `Text` component the rest of the app — including chat's user bubble —
// uses, so both message roles share identical typography.

// Mirrors `INCOMPLETE_LINK_PLACEHOLDER` from the library's (unexported) `core/incomplete-markdown`
// module: `sanitizeIncompleteMarkdown` rewrites a trailing, not-yet-closed `[text](url` into a
// link pointing at this sentinel so a streaming link mid-type doesn't briefly resolve to a bogus
// URL. Consumers are expected to render that link as plain text.
const INCOMPLETE_LINK_PLACEHOLDER = "streamdown:incomplete-link";

const monospaceFont = "Menlo, monospace" as const;

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  url?: string;
  align?: Array<"left" | "right" | "center" | null>;
  children?: MarkdownNode[];
};

type RenderContext = {
  inList?: boolean;
  isLast?: boolean;
};

const bodyTextClassName = "text-sm leading-relaxed text-foreground";

export function MarkdownText({ className, content }: { className?: string; content: string }) {
  const ast = useMemo(
    () => parseMarkdown(content) as unknown as { children: MarkdownNode[] },
    [content],
  );

  return (
    <View className={className}>
      {ast.children.map((node, index) =>
        renderBlock(node, `block-${index}`, { isLast: index === ast.children.length - 1 }),
      )}
    </View>
  );
}

function renderBlock(node: MarkdownNode, key: string, context?: RenderContext): ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <Text
          key={key}
          className={cn(bodyTextClassName, !context?.inList && !context?.isLast && "mb-3")}
          selectable
          variant={null}
        >
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    case "heading":
      return (
        <Text
          key={key}
          className={cn(bodyTextClassName, "font-bold", !context?.isLast && "mb-2")}
          selectable
          variant={null}
        >
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    case "list":
      return (
        <View key={key} className={cn("gap-1.5", !context?.isLast && "mb-3")}>
          {(node.children ?? []).map((item, index) =>
            renderListItem(item, `${key}-${index}`, {
              ordered: node.ordered ?? false,
              start: node.start ?? 1,
              index,
            }),
          )}
        </View>
      );
    case "code":
      return (
        <View
          key={key}
          className={cn(
            "rounded-lg border border-border bg-background/60 p-3",
            !context?.isLast && "mb-3",
          )}
        >
          <Text
            className={bodyTextClassName}
            selectable
            style={{ fontFamily: monospaceFont }}
            variant={null}
          >
            {node.value ?? ""}
          </Text>
        </View>
      );
    case "blockquote":
      return (
        <View
          key={key}
          className={cn(
            "gap-1 rounded-md border-l-4 border-border bg-background/60 py-1.5 pl-3",
            !context?.isLast && "mb-3",
          )}
        >
          {(node.children ?? []).map((child, index, children) =>
            renderBlock(child, `${key}-${index}`, {
              ...context,
              isLast: index === children.length - 1,
            }),
          )}
        </View>
      );
    case "thematicBreak":
      return <View key={key} className={cn("h-px bg-border", !context?.isLast && "mb-3")} />;
    case "table":
      return renderTable(node, key, context?.isLast);
    case "math":
    case "html":
      return node.type === "math" ? (
        <Text
          key={key}
          className={cn(bodyTextClassName, !context?.isLast && "mb-3")}
          selectable
          style={{ fontFamily: monospaceFont }}
          variant={null}
        >
          {node.value ?? ""}
        </Text>
      ) : null;
    default:
      return null;
  }
}

function renderListItem(
  item: MarkdownNode,
  key: string,
  meta: { ordered: boolean; start: number; index: number },
): ReactNode {
  const hasCheckbox = typeof item.checked === "boolean";
  const marker = meta.ordered ? `${meta.start + meta.index}.` : "•";

  return (
    <View key={key} className="flex-row items-start gap-2">
      {hasCheckbox ? (
        <View
          className={cn(
            "mt-1 size-4 items-center justify-center rounded border",
            item.checked ? "border-primary bg-primary" : "border-border",
          )}
        >
          {item.checked ? <Icon as={Check} className="size-3 text-primary-foreground" /> : null}
        </View>
      ) : (
        <Text className={cn("w-4", bodyTextClassName)} variant={null}>
          {marker}
        </Text>
      )}
      <View className="min-w-0 flex-1">
        {(item.children ?? []).map((child, index, children) =>
          renderBlock(child, `${key}-${index}`, {
            inList: true,
            isLast: index === children.length - 1,
          }),
        )}
      </View>
    </View>
  );
}

function renderTable(node: MarkdownNode, key: string, isLast?: boolean): ReactNode {
  const rows = node.children ?? [];
  const align = node.align ?? [];

  return (
    <ScrollView
      key={key}
      className={cn(!isLast && "mb-3")}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <View className="overflow-hidden rounded-lg border border-border">
        {rows.map((row, rowIndex) => (
          <View
            key={`${key}-row-${rowIndex}`}
            className={cn(
              "flex-row",
              rowIndex > 0 && "border-t border-border",
              rowIndex === 0 && "bg-muted",
            )}
          >
            {(row.children ?? []).map((cell, colIndex) => (
              <View
                key={`${key}-cell-${rowIndex}-${colIndex}`}
                className={cn(
                  "min-w-24 justify-center px-2.5 py-2",
                  colIndex > 0 && "border-l border-border",
                )}
              >
                <Text
                  className={cn(bodyTextClassName, rowIndex === 0 && "font-semibold")}
                  numberOfLines={3}
                  selectable
                  style={{ textAlign: align[colIndex] ?? "left" }}
                  variant={null}
                >
                  {renderInline(cell.children ?? [], `${key}-cell-${rowIndex}-${colIndex}`)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function renderInline(nodes: MarkdownNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => renderInlineNode(node, `${keyPrefix}-${index}`));
}

function renderInlineNode(node: MarkdownNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "strong":
      return (
        <Text key={key} className="font-bold" variant={null}>
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    case "emphasis":
      return (
        <Text key={key} className="italic" variant={null}>
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    case "delete":
      return (
        <Text key={key} className="line-through" variant={null}>
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    case "inlineCode":
      return (
        <Text
          key={key}
          className="rounded bg-muted px-1 text-foreground"
          style={{ fontFamily: monospaceFont }}
          variant={null}
        >
          {node.value ?? ""}
        </Text>
      );
    case "link": {
      if (node.url === INCOMPLETE_LINK_PLACEHOLDER) {
        return (
          <Text key={key} variant={null}>
            {renderInline(node.children ?? [], key)}
          </Text>
        );
      }
      const url = node.url ?? "";
      return (
        <Text
          key={key}
          className="text-primary underline"
          onPress={url ? () => void Linking.openURL(url).catch(() => {}) : undefined}
          variant={null}
        >
          {renderInline(node.children ?? [], key)}
        </Text>
      );
    }
    case "break":
      return "\n";
    case "inlineMath":
      return (
        <Text key={key} style={{ fontFamily: monospaceFont }} variant={null}>
          {node.value ?? ""}
        </Text>
      );
    default:
      return null;
  }
}
