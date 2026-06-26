import { ChatMarkdown } from "@/components/markdown";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Align = "start" | "end";

/** Row wrapper: avatar + content, flipped for end-aligned (user) messages. */
export function Message({
  from,
  align,
  children,
}: {
  from?: "user" | "assistant";
  align?: Align;
  children: ReactNode;
}) {
  const isEnd = align === "end" || from === "user";
  return (
    <View className={`flex flex-row items-end gap-3${isEnd ? " flex-row-reverse" : ""}`}>
      {children}
    </View>
  );
}

/** Groups consecutive messages from the same sender with tighter spacing. */
export function MessageGroup({ children }: { children: ReactNode }) {
  return <View className="flex flex-col gap-1">{children}</View>;
}

/**
 * Avatar slot anchored to the message bottom.
 * Pass children (e.g. an icon or initials) for the filled avatar; pass nothing to
 * render an empty spacer that keeps grouped messages aligned.
 */
export function MessageAvatar({ children }: { children?: ReactNode }) {
  if (!children) return <View className="w-7 shrink-0" />;
  return (
    <View className="flex h-5.25 shrink-0 items-center">
      <View className="bg-muted/60 ring-border/50 flex h-7 w-7 items-center justify-center rounded-lg ring-1">
        {children}
      </View>
    </View>
  );
}

/** Column wrapper for header, bubble surface, and footer. */
export function MessageContent({ children }: { children: ReactNode }) {
  return <View className="flex max-w-[min(80%,56ch)] min-w-0 flex-col gap-1">{children}</View>;
}

/** Content rendered above the bubble, e.g. sender name. */
export function MessageHeader({ children }: { children: ReactNode }) {
  return <View className="px-1">{children}</View>;
}

/** Content rendered below the bubble, e.g. timestamp or action buttons. */
export function MessageFooter({ children }: { children: ReactNode }) {
  return <View className="px-1">{children}</View>;
}

/** Markdown assistant response. */
export function MessageResponse({ children }: { children: string }) {
  return <ChatMarkdown>{children || "..."}</ChatMarkdown>;
}

/** Default AI avatar icon — pass as children to MessageAvatar for assistant messages. */
export function MessageAIAvatar() {
  return <Text className="text-muted-foreground text-[11px]">AI</Text>;
}

/** Styled bubble surface for user messages. */
export function MessageBubble({ children }: { children: ReactNode }) {
  return (
    <View className="border-border/30 from-secondary to-muted shadow-card overflow-hidden rounded-2xl rounded-br-lg border bg-linear-to-br px-3.5 py-2">
      {typeof children === "string" ? (
        <Text selectable className="text-foreground text-[13px] leading-[1.65]">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
