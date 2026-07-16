import { ArrowUp, Square } from "lucide-react-native";
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PromptInputContextValue = {
  send: () => void;
  setText: (text: string) => void;
  streaming: boolean;
  text: string;
};

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null);

function usePromptInput() {
  const context = React.use(PromptInputContext);
  if (!context) throw new Error("PromptInput components must be inside PromptInput");
  return context;
}

type PromptInputProps = React.ComponentProps<typeof View> & {
  clearOnSend?: boolean;
  onChangeText?: (text: string) => void;
  onSend?: (text: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  value?: string;
};

function PromptInput({
  children,
  className,
  clearOnSend = true,
  onChangeText,
  onSend,
  onStop,
  streaming = false,
  value,
  ...props
}: PromptInputProps) {
  const [internalText, setInternalText] = React.useState("");
  const text = value ?? internalText;
  const setText = React.useCallback(
    (nextText: string) => {
      if (value === undefined) setInternalText(nextText);
      onChangeText?.(nextText);
    },
    [onChangeText, value],
  );
  const send = React.useCallback(() => {
    if (streaming) {
      onStop?.();
      return;
    }
    const message = text.trim();
    if (!message) return;
    onSend?.(message);
    if (clearOnSend && value === undefined) setInternalText("");
  }, [clearOnSend, onSend, onStop, streaming, text, value]);
  const context = React.useMemo(
    () => ({ send, setText, streaming, text }),
    [send, setText, streaming, text],
  );

  return (
    <PromptInputContext value={context}>
      <View
        className={cn("rounded-3xl border border-input bg-card px-3 pt-3 pb-2", className)}
        {...props}
      >
        {children}
      </View>
    </PromptInputContext>
  );
}

type PromptInputTextareaProps = Omit<
  React.ComponentProps<typeof Textarea>,
  "multiline" | "onChangeText" | "value"
>;

const PromptInputTextarea = React.forwardRef<TextInput, PromptInputTextareaProps>(
  function PromptInputTextarea({ className, ...props }, ref) {
    const { setText, text } = usePromptInput();
    return (
      <Textarea
        ref={ref}
        className={cn("max-h-28 min-h-10 border-0 bg-transparent p-0 shadow-none", className)}
        numberOfLines={4}
        onChangeText={setText}
        value={text}
        {...props}
      />
    );
  },
);

function PromptInputToolbar({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("flex-row items-center gap-1 pt-2", className)} {...props} />;
}

function PromptInputSpacer() {
  return <View className="flex-1" />;
}

function PromptInputButton({ className, ...props }: React.ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-full px-2 active:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

type PromptInputSendProps = React.ComponentProps<typeof Pressable> & {
  emptyFallback?: React.ReactNode;
};

function PromptInputSend({
  className,
  disabled: disabledProp,
  emptyFallback,
  ...props
}: PromptInputSendProps) {
  const { send, streaming, text } = usePromptInput();
  const canSend = Boolean(text.trim());
  const disabled = Boolean(disabledProp) || (!canSend && !streaming);
  if (!canSend && !streaming && emptyFallback) return emptyFallback;

  return (
    <Pressable
      accessibilityLabel={streaming ? "Stop generating" : "Send message"}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "size-11 items-center justify-center rounded-full bg-primary",
        disabled && "opacity-40",
        className,
      )}
      disabled={disabled}
      onPress={send}
      {...props}
    >
      <Icon
        as={streaming ? Square : ArrowUp}
        className={cn(
          "text-primary-foreground",
          streaming ? "size-3.5 fill-primary-foreground" : "size-5",
        )}
        strokeWidth={2.5}
      />
    </Pressable>
  );
}

export {
  PromptInput,
  PromptInputButton,
  PromptInputSend,
  PromptInputSpacer,
  PromptInputTextarea,
  PromptInputToolbar,
  usePromptInput,
};
export type { PromptInputProps, PromptInputSendProps, PromptInputTextareaProps };
