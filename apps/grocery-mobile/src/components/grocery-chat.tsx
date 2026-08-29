import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react-native";
import { useForm } from "react-hook-form";
import { ADD_TO_CART_MESSAGE, AddToCartDialog } from "@/components/add-to-cart-dialog";
import { GroceryStateCard } from "@/components/grocery-state-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormField } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { KeyboardView } from "@/components/ui/keyboard-view";
import { MarkdownText } from "@/components/ui/markdown-text";
import {
  PromptInput,
  PromptInputSend,
  PromptInputSpacer,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@/components/ui/prompt-input";
import { SafeArea } from "@/components/ui/safe-area";
import { Text } from "@/components/ui/text";
import {
  useGroceryMessages,
  useGroceryState,
  type GroceryOperationOutcome,
} from "@/hooks/use-grocery-agent";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import type { DisplayMessage } from "@/lib/grocery-state";
import { GROCERY_SUGGESTIONS } from "@/lib/grocery-suggestions";
import { cn } from "@/lib/utils";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ANDROID_HEADER_HEIGHT = 56;

export function GroceryChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cartDialogOpen, setCartDialogOpen] = useState(false);
  const [reasoningDurations, setReasoningDurations] = useState<Record<string, number>>({});
  const { activeThreadId, isRunning, error, failedInput, clearError, retry, send, stop } =
    useGroceryAgent();
  const state = useGroceryState();
  const { messages, isStreaming } = useGroceryMessages();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const latestMessageId = messages.at(-1)?.id;
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  const nearBottomRef = useRef(true);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  const handleScroll = useCallback(({ nativeEvent }: { nativeEvent: NativeScrollEvent }) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    nearBottomRef.current = distanceFromBottom < 80;
  }, []);
  // Anchor to the bottom with an explicitly clamped offset: scrollToEnd leaves a
  // stale offset behind when the content shrinks (new chat) or the viewport
  // resizes (keyboard), which shows as phantom blank space.
  const followStream = useCallback(() => {
    if (!nearBottomRef.current) return;
    const offset = Math.max(0, contentHeightRef.current - layoutHeightRef.current);
    listRef.current?.scrollToOffset({ animated: false, offset });
  }, []);
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      followStream();
    },
    [followStream],
  );
  const handleLayout = useCallback(
    ({ nativeEvent }: { nativeEvent: { layout: { height: number } } }) => {
      layoutHeightRef.current = nativeEvent.layout.height;
      followStream();
    },
    [followStream],
  );
  const sendAndFollow = useCallback(
    (content: string) => {
      nearBottomRef.current = true;
      return send(content);
    },
    [send],
  );

  const openLatestList = useCallback(() => router.push("/list"), [router]);
  const openListSave = useCallback(
    () => router.push({ pathname: "/list", params: { save: "1" } }),
    [router],
  );
  const openRecipeSave = useCallback(
    () => router.push({ pathname: "/saved-recipes", params: { save: "1" } }),
    [router],
  );
  const confirmAddToCart = useCallback(() => {
    setCartDialogOpen(true);
  }, []);
  const recordReasoningDuration = useCallback((messageId: string, seconds: number) => {
    setReasoningDurations((current) =>
      current[messageId] === seconds ? current : { ...current, [messageId]: seconds },
    );
  }, []);
  const renderMessage = useCallback<ListRenderItem<DisplayMessage>>(
    ({ item: message }) => (
      <MessageItem
        completedReasoningDuration={reasoningDurations[message.id]}
        isStreaming={isStreaming && message.id === latestMessageId}
        message={message}
        onReasoningDurationComplete={recordReasoningDuration}
      />
    ),
    [isStreaming, latestMessageId, reasoningDurations, recordReasoningDuration],
  );

  return (
    <KeyboardView
      automaticOffset={process.env.EXPO_OS !== "android"}
      behavior={process.env.EXPO_OS === "android" ? "height" : undefined}
      offset={process.env.EXPO_OS === "android" ? insets.top + ANDROID_HEADER_HEIGHT : undefined}
    >
      <FlatList
        ref={listRef}
        className="w-full max-w-3xl flex-1 self-center"
        contentContainerClassName="grow gap-3 px-4 py-3 sm:px-6"
        contentInsetAdjustmentBehavior="automatic"
        data={messages}
        keyExtractor={messageKey}
        keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        renderItem={renderMessage}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<ChatEmptyState disabled={isRunning} onSend={sendAndFollow} />}
        ListFooterComponent={
          <View className="gap-3">
            <GroceryStateCard
              state={state}
              adding={isRunning}
              connected={connected}
              onOpenList={openLatestList}
              onAddToCart={confirmAddToCart}
              onSaveList={openListSave}
              onSaveRecipe={state.recipe ? openRecipeSave : undefined}
            />
            <KrogerConnectionCard connection={connection} />
            {error ? (
              <View className="gap-2">
                <Alert title={error} variant="destructive" />
                <View className="flex-row justify-end gap-2">
                  {failedInput ? (
                    <Button
                      accessibilityLabel="Retry failed message"
                      disabled={isRunning}
                      onPress={() => void retry()}
                      size="sm"
                      variant="secondary"
                    >
                      Retry
                    </Button>
                  ) : null}
                  <Button
                    accessibilityLabel="Dismiss chat error"
                    onPress={clearError}
                    size="sm"
                    variant="ghost"
                  >
                    Dismiss
                  </Button>
                </View>
              </View>
            ) : null}
          </View>
        }
      />
      <SafeArea className="flex-none border-t border-border" edges={["bottom"]}>
        <View className="w-full max-w-3xl self-center px-4 py-3 sm:px-6">
          <ChatComposer
            key={activeThreadId ?? "grocery"}
            isRunning={isRunning}
            onSend={sendAndFollow}
            onStop={stop}
          />
        </View>
      </SafeArea>
      <AddToCartDialog
        open={cartDialogOpen}
        onOpenChange={setCartDialogOpen}
        onConfirm={() => void send(ADD_TO_CART_MESSAGE)}
      />
    </KeyboardView>
  );
}

const ChatEmptyState = memo(function ChatEmptyState({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => Promise<GroceryOperationOutcome>;
}) {
  return (
    <View className="items-center gap-3 px-3 py-6">
      <View className="size-14 items-center justify-center rounded-2xl bg-muted">
        <Icon as={Sparkles} className="size-6.5 text-primary" />
      </View>
      <Text className="text-center" variant="h3">
        What are you shopping for?
      </Text>
      <Text className="max-w-88 text-center text-muted-foreground">
        Describe a recipe, a weekly budget, or the meals you need. I’ll turn it into a practical
        list you control.
      </Text>
      <View className="w-full flex-row flex-wrap justify-center gap-2">
        {GROCERY_SUGGESTIONS.map((suggestion) => (
          <Chip
            key={suggestion.title}
            accessibilityLabel={suggestion.title}
            disabled={disabled}
            onPress={() => void onSend(suggestion.message)}
          >
            {suggestion.title}
          </Chip>
        ))}
      </View>
    </View>
  );
});

function messageKey(message: DisplayMessage) {
  return message.id;
}

const UserMessage = memo(function UserMessage({ content, id }: { content: string; id: string }) {
  return (
    <View className="w-full items-end" nativeID={id}>
      <View className="max-w-3/4 rounded-2xl rounded-br-sm bg-primary px-4 py-2.5">
        <Text className="text-end text-sm leading-relaxed text-primary-foreground" selectable>
          {content}
        </Text>
      </View>
    </View>
  );
});

const MessageItem = memo(function MessageItem({
  completedReasoningDuration,
  isStreaming,
  message,
  onReasoningDurationComplete,
}: {
  completedReasoningDuration?: number;
  isStreaming: boolean;
  message: DisplayMessage;
  onReasoningDurationComplete: (messageId: string, seconds: number) => void;
}) {
  if (message.role === "user") {
    return <UserMessage content={message.content} id={message.id} />;
  }

  return (
    <View className="w-full items-start" collapsable nativeID={message.id}>
      {message.role === "reasoning" ? (
        <ReasoningSection
          completedDuration={completedReasoningDuration}
          content={message.content}
          isStreaming={isStreaming}
          messageId={message.id}
          onDurationComplete={onReasoningDurationComplete}
        />
      ) : message.role === "tool" ? (
        <ToolCallSection
          name={message.name}
          parameters={message.parameters}
          result={message.result}
          status={message.status}
        />
      ) : (
        <View className="max-w-3/4 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5">
          <MarkdownText className="min-w-0 self-start" content={message.content} />
        </View>
      )}
    </View>
  );
});

const ChatComposer = memo(function ChatComposer({
  isRunning,
  onSend,
  onStop,
}: {
  isRunning: boolean;
  onSend: (content: string) => Promise<GroceryOperationOutcome>;
  onStop: () => Promise<GroceryOperationOutcome>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<{ message: string }>({ defaultValues: { message: "" } });
  const submit = handleSubmit(async ({ message }) => {
    const content = message.trim();
    if (!content || isRunning) return;

    Keyboard.dismiss();
    reset();
    const outcome = await onSend(content);
    if (outcome.status === "failed") reset({ message: content });
  });

  return (
    <FormField
      control={control}
      name="message"
      rules={{ validate: (value) => value.trim().length > 0 }}
      render={({ field }) => (
        <PromptInput
          clearOnSend={false}
          onChangeText={field.onChange}
          onSend={() => void submit()}
          onStop={() => void onStop()}
          streaming={isRunning || isSubmitting}
          value={field.value}
        >
          <PromptInputTextarea ref={field.ref} onBlur={field.onBlur} />
          <PromptInputToolbar>
            <PromptInputSpacer />
            <PromptInputSend />
          </PromptInputToolbar>
        </PromptInput>
      )}
    />
  );
});

function formatReasoningDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

function ReasoningSection({
  completedDuration,
  content,
  isStreaming,
  messageId,
  onDurationComplete,
}: {
  completedDuration?: number;
  content: string;
  isStreaming: boolean;
  messageId: string;
  onDurationComplete: (messageId: string, seconds: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(completedDuration ?? null);

  useEffect(() => {
    if (!isStreaming) {
      if (startedAtRef.current !== null) {
        const duration = Math.max(1, Math.ceil((Date.now() - startedAtRef.current) / 1000));
        setElapsedSeconds(duration);
        onDurationComplete(messageId, duration);
        startedAtRef.current = null;
      }
      return;
    }

    startedAtRef.current ??= Date.now();
    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
    };
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, messageId, onDurationComplete]);

  const reasoningLabel = isStreaming
    ? elapsedSeconds && elapsedSeconds > 0
      ? `Thinking for ${formatReasoningDuration(elapsedSeconds)}`
      : "Thinking…"
    : elapsedSeconds === null
      ? "Thought"
      : `Thought for ${formatReasoningDuration(elapsedSeconds)}`;

  return (
    <Collapsible className="w-full gap-1 self-stretch" onOpenChange={setExpanded} open={expanded}>
      <CollapsibleTrigger
        accessibilityLabel={expanded ? "Hide reasoning" : "Show reasoning"}
        accessibilityState={{ expanded }}
        className="min-h-14 flex-row items-center gap-1 self-start active:opacity-65"
      >
        <View className="size-4 items-center justify-center">
          {expanded ? (
            <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
          ) : (
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          )}
        </View>
        <Text className="text-muted-foreground" variant="small">
          {reasoningLabel}
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 self-start border-l border-border py-1 pl-3.5">
        <Text className="leading-5" variant="muted">
          {content}
        </Text>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallSection({
  name,
  parameters,
  result,
  status,
}: {
  name: string;
  parameters: unknown;
  result?: unknown;
  status: "running" | "complete" | "failed";
}) {
  const [expanded, setExpanded] = useState(false);
  const label = toolLabel(name);
  return (
    <Collapsible className="w-full gap-1 self-stretch" onOpenChange={setExpanded} open={expanded}>
      <CollapsibleTrigger
        accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${label}`}
        accessibilityState={{ expanded }}
        className="min-h-14 flex-row items-center gap-1 active:opacity-65"
      >
        <View className="size-4 items-center justify-center">
          {expanded ? (
            <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
          ) : (
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          )}
        </View>
        <Text className="shrink text-muted-foreground" numberOfLines={1} variant="small">
          {label}
        </Text>
        <Text
          className={cn("ml-auto text-muted-foreground", status === "failed" && "text-destructive")}
          variant="small"
        >
          {status === "running" ? "Running" : status === "failed" ? "Failed" : "Done"}
        </Text>
      </CollapsibleTrigger>
      {expanded ? (
        <CollapsibleContent className="ml-2 max-h-39 border-l border-border py-1 pl-3.5">
          <ScrollView nestedScrollEnabled>
            <Text className="mb-0.5 font-semibold text-muted-foreground" variant="small">
              Input
            </Text>
            <Text className="mb-2 leading-4.5" selectable variant="muted">
              {formatToolValue(parameters)}
            </Text>
            {status !== "running" ? (
              <>
                <Text className="mb-0.5 font-semibold text-muted-foreground" variant="small">
                  Result
                </Text>
                <Text className="mb-2 leading-4.5" selectable variant="muted">
                  {formatToolValue(result)}
                </Text>
              </>
            ) : null}
          </ScrollView>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    set_shopping_list: "Created shopping list",
    set_product_matches: "Matched Kroger products",
    update_cart: "Updated Kroger cart",
    set_meal_plan: "Created meal plan",
    set_weekly_deals: "Saved weekly deals",
    mark_list_ready: "Prepared grocery list",
    get_current_date: "Checked current date",
    get_weekly_deals: "Checked weekly deals",
    get_shopping_profile: "Checked shopping profile",
    get_meal_planning_context: "Checked meal planning context",
    search_products: "Searched Kroger products",
    web_search: "Searched the web",
    load_web_page: "Read web page",
  };
  if (labels[name]) return labels[name];
  const words = name.split("_").filter(Boolean).join(" ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function formatToolValue(value: unknown): string {
  if (typeof value === "string") return value || "None";
  if (value === undefined) return "None";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
