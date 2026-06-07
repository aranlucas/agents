import { ArrowUp, Paperclip } from "lucide-react";
import { Children, type ReactNode, isValidElement } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { useChatContext } from "./chat-context";
import { useConversationContext } from "./conversation";

/**
 * Root container for the message composer matching Vercel chatbot design.
 * Centered max-w-4xl card with rounded-2xl border/shadow.
 * Collects PromptInputAction children and renders them in a footer row.
 */
export function PromptInput({ children }: { children: ReactNode }) {
  const { onPromptInputLayout } = useConversationContext();

  // Separate action buttons from body (which contains textarea + submit)
  const actions: ReactNode[] = [];
  let body: ReactNode = null;

  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === PromptInputAction) {
      actions.push(child);
    } else if (isValidElement(child) && child.type === PromptInputBody) {
      body = child;
    }
  });

  return (
    <View
      onLayout={onPromptInputLayout}
      className="bg-background sticky bottom-0 z-10 mx-auto flex w-full max-w-4xl gap-2 px-2 pb-3 md:px-4 md:pb-4"
    >
      <View className="border-border/30 bg-card/70 shadow-composer focus-within:shadow-composer-focus flex w-full flex-col rounded-2xl border transition-shadow duration-300">
        {body}
      </View>
    </View>
  );
}

/**
 * Action button (e.g. attachments) in the composer footer.
 */
export function PromptInputAction({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="border-border/40 hover:bg-accent flex h-7 w-7 items-center justify-center rounded-lg border transition-colors"
    >
      {children}
    </Pressable>
  );
}

/**
 * Container wrapping the textarea and the footer row with submit + tools.
 * On web, PromptInputBody renders the textarea children PLUS a footer row.
 */
export function PromptInputBody({ children }: { children: ReactNode }) {
  // Separate textarea from submit button
  const textarea: ReactNode[] = [];
  let submit: ReactNode = null;

  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === PromptInputSubmit) {
      submit = child;
    } else {
      textarea.push(child);
    }
  });

  return (
    <View className="flex flex-col">
      {/* Textarea area */}
      {textarea}
      {/* Footer row: tools on left, submit on right */}
      <View className="flex flex-row items-center justify-between px-3 pb-3">
        <View className="flex flex-row items-center gap-1">
          {/* Attachments button */}
          <Pressable className="border-border/40 hover:bg-accent flex h-7 w-7 items-center justify-center rounded-lg border transition-colors">
            <Paperclip size={14} className="text-muted-foreground" />
          </Pressable>
          {/* Model selector mock */}
          <Pressable className="hover:bg-accent flex h-7 flex-row items-center gap-1.5 rounded-lg px-2 transition-colors">
            <Text className="text-muted-foreground text-[12px]">Opus</Text>
          </Pressable>
        </View>
        {submit}
      </View>
    </View>
  );
}

/**
 * Auto-growing text input matching Vercel chatbot's textarea.
 * resize: none removes the browser resize handle.
 */
export function PromptInputTextarea({
  placeholder = "Chat with Agent...",
  maxLength = 1000,
}: {
  placeholder?: string;
  maxLength?: number;
}) {
  const { input, setInput, onSend } = useChatContext();

  return (
    <TextInput
      nativeID="composer"
      className="text-foreground placeholder:text-muted-foreground/35 min-h-24 w-full bg-transparent px-4 pt-3.5 pb-1.5 text-[13px] leading-relaxed outline-none"
      // `resize` is a web-only CSS property not present in RN's style types.
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      style={{ maxHeight: 200, resize: "none" } as any}
      value={input}
      onChangeText={setInput}
      placeholder={placeholder}
      placeholderTextColorClassName="tint-muted-foreground"
      multiline
      maxLength={maxLength}
      onKeyPress={(e) => {
        // Web key events expose `key`/`shiftKey`, which RN's event type omits.
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const nativeEvent = (e as any).nativeEvent as { key: string; shiftKey: boolean };
        if (nativeEvent.key === "Enter" && !nativeEvent.shiftKey) {
          e.preventDefault();
          onSend();
        }
      }}
    />
  );
}

/**
 * Submit button matching Vercel chatbot's send/stop button.
 */
export function PromptInputSubmit() {
  const { input, isGenerating, onSend } = useChatContext();
  const disabled = !input.trim() || isGenerating;

  return (
    <Pressable
      onPress={onSend}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-xl transition-all duration-200 ${
        disabled ? "bg-muted cursor-not-allowed" : "bg-foreground hover:opacity-85 active:scale-95"
      }`}
    >
      {isGenerating ? (
        <ActivityIndicator size="small" colorClassName="tint-background" />
      ) : (
        <ArrowUp
          size={16}
          strokeWidth={2.5}
          className={disabled ? "text-muted-foreground/25" : "text-background"}
        />
      )}
    </Pressable>
  );
}
