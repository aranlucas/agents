import { ChatMarkdown } from "@/components/markdown";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * Web message component matching Vercel chatbot design.
 */
export function Message({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  if (from === "user") {
    return (
      <View className="animate-fade-up flex flex-col items-end gap-2">
        <View className="border-border/30 from-secondary to-muted shadow-card max-w-[min(80%,56ch)] overflow-hidden rounded-2xl rounded-br-lg border bg-linear-to-br px-3.5 py-2 wrap-break-word">
          {typeof children === "string" ? (
            <Text selectable className="text-foreground text-[13px] leading-[1.65]">
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="flex flex-row items-start gap-3">
      <View className="flex h-5.25 shrink-0 items-center">
        <View className="bg-muted/60 text-muted-foreground ring-border/50 flex h-7 w-7 items-center justify-center rounded-lg ring-1">
          <Text className="text-muted-foreground text-[11px]">AI</Text>
        </View>
      </View>
      <View className="flex min-w-0 flex-1 flex-col gap-2">{children}</View>
    </View>
  );
}

/**
 * Renders markdown content for an assistant message.
 */
export function MessageResponse({ children }: { children: string }) {
  return <ChatMarkdown>{children || "..."}</ChatMarkdown>;
}
