import { ChatMarkdown } from "@/components/markdown";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

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
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className={`mb-2 flex-row items-end gap-2${isEnd ? " flex-row-reverse" : ""}`}
    >
      {children}
    </Animated.View>
  );
}

/** Groups consecutive messages from the same sender with tighter spacing. */
export function MessageGroup({ children }: { children: ReactNode }) {
  return <View className="mb-2 gap-1">{children}</View>;
}

/** Avatar slot anchored to the message bottom. Render empty to preserve alignment in a group. */
export function MessageAvatar({ children }: { children?: ReactNode }) {
  return <View className="w-8 shrink-0">{children}</View>;
}

/** Column wrapper for header, bubble surface, and footer. */
export function MessageContent({ children }: { children: ReactNode }) {
  return <View className="max-w-[80%] gap-1">{children}</View>;
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
