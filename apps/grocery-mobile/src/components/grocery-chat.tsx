import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { ChevronDown, ChevronRight, Menu, Sparkles } from "lucide-react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { NativeMarkdown, type NativeMarkdownStyle } from "@agents/native-markdown";
import { useResolveClassNames } from "uniwind";
import { GroceryStateCard } from "@/components/grocery-state-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerList,
  type MessageScrollerHandle,
  useMessageScrollerControls,
} from "@/components/message-scroller";
import { ErrorAlert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { KeyboardView } from "@/components/ui/keyboard-view";
import {
  PromptInput,
  PromptInputButton,
  PromptInputSend,
  PromptInputSpacer,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@/components/ui/prompt-input";
import { SafeArea } from "@/components/ui/safe-area";
import { Text } from "@/components/ui/text";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import type { GroceryOperationOutcome } from "@/hooks/use-grocery-agent";
import type { DisplayMessage } from "@/lib/grocery-state";
import { suggestionKey } from "@/lib/grocery-suggestions";
import { cn } from "@/lib/utils";

export function GroceryChat() {
  const router = useRouter();
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<MessageScrollerHandle>(null);
  const [cartDialogOpen, setCartDialogOpen] = useState(false);
  const [composerVersion, setComposerVersion] = useState(0);
  const [reasoningDurations, setReasoningDurations] = useState<Record<string, number>>({});
  const {
    state,
    messages,
    isRunning,
    isStreaming,
    error,
    failedInput,
    clearError,
    retry,
    send,
    stop,
    startNewChat,
    suggestions,
  } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const foreground = useResolveClassNames("text-foreground").color;
  const primary = useResolveClassNames("text-primary").color;
  const muted = useResolveClassNames("bg-muted").backgroundColor;
  const border = useResolveClassNames("border-border").borderColor;
  const markdownStyle = useMemo<NativeMarkdownStyle>(
    () => ({
      body: { color: foreground, fontSize: 15, lineHeight: 22 },
      link: { color: primary },
      blockquote: { backgroundColor: muted, borderColor: border },
      table: { borderColor: border },
      thead: { backgroundColor: muted },
      tr: { borderColor: border },
      code_inline: { backgroundColor: muted, borderColor: border },
      code_block: { backgroundColor: muted, borderColor: border },
      fence: { backgroundColor: muted, borderColor: border },
    }),
    [border, foreground, muted, primary],
  );
  const { latestAssistant, latestReasoning, latestGroceryList, latestMessage, timelineRevision } =
    useMemo(
      () => ({
        latestAssistant: messages.findLast((message) => message.role === "assistant"),
        latestReasoning: messages.findLast((message) => message.role === "reasoning"),
        latestGroceryList: messages.findLast((message) => message.role === "grocery-list"),
        latestMessage: messages.at(-1),
        timelineRevision: `${messages.length}:${messages.reduce(
          (length, message) => length + ("content" in message ? message.content.length : 0),
          0,
        )}:${messages.at(-1)?.id ?? ""}`,
      }),
      [messages],
    );

  const sendMessage = useCallback(async (content: string) => send(content), [send]);
  const closeMenu = useCallback(() => menuSheetRef.current?.dismiss(), []);
  const openMenu = useCallback(() => {
    Keyboard.dismiss();
    menuSheetRef.current?.present();
  }, []);

  const openLatestList = useCallback(() => router.push("/list"), [router]);
  const confirmAddToCart = useCallback(() => {
    setCartDialogOpen(true);
  }, []);
  const recordReasoningDuration = useCallback((messageId: string, seconds: number) => {
    setReasoningDurations((current) =>
      current[messageId] === seconds ? current : { ...current, [messageId]: seconds },
    );
  }, []);
  const renderMessage = useCallback(
    ({ item: message }: { item: DisplayMessage }) => {
      const assistantContent =
        message.role === "assistant" &&
        message.id === latestAssistant?.id &&
        state.status === "ready"
          ? state.review_summary || "Your grocery list is ready to review."
          : undefined;
      const isLatestGroceryList =
        message.role === "grocery-list" && message.id === latestGroceryList?.id;
      return (
        <GroceryMessage
          assistantContent={assistantContent}
          connected={connected}
          isAdding={isStreaming && isLatestGroceryList}
          isLatestGroceryList={isLatestGroceryList}
          isStreaming={isStreaming && message.id === latestMessage?.id}
          markdownStyle={markdownStyle}
          message={message}
          onAddToCart={confirmAddToCart}
          onOpenList={openLatestList}
          onReasoningDuration={recordReasoningDuration}
          reasoningDuration={reasoningDurations[message.id]}
        />
      );
    },
    [
      connected,
      confirmAddToCart,
      isStreaming,
      latestAssistant?.id,
      latestGroceryList?.id,
      latestMessage?.id,
      latestReasoning?.id,
      markdownStyle,
      openLatestList,
      reasoningDurations,
      recordReasoningDuration,
      state.review_summary,
      state.status,
    ],
  );

  const newChat = async () => {
    closeMenu();
    const outcome = await startNewChat();
    if (outcome.status !== "success") return;
    setComposerVersion((current) => current + 1);
    setReasoningDurations({});
    scrollRef.current?.scrollToStart();
  };

  const openMenuRoute = (route: "/saved-recipes" | "/chat-history") => {
    closeMenu();
    router.push(route);
  };

  return (
    <KeyboardView
      behavior={process.env.EXPO_OS === "android" ? "height" : "padding"}
      className="bg-background"
      offset={process.env.EXPO_OS === "ios" ? 92 : 0}
    >
      <MessageScroller ref={scrollRef} autoScroll revision={timelineRevision}>
        <MessageScrollerList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-3 px-4 pt-3.5 pb-4.5"
          data={messages}
          initialNumToRender={10}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={8}
          renderItem={renderMessage}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          ListEmptyComponent={
            <View className="items-center gap-2.5 px-3 py-6">
              <View className="mb-1 size-14 items-center justify-center rounded-2xl bg-muted">
                <Icon as={Sparkles} className="size-6.5 text-primary" />
              </View>
              <Text className="text-center text-2xl font-extrabold" selectable variant="h3">
                What are you shopping for?
              </Text>
              <Text className="max-w-88 text-center leading-6 text-muted-foreground" selectable>
                Describe a recipe, a weekly budget, or the meals you need. I’ll turn it into a
                practical list you control.
              </Text>
              <View className="mt-2.5 w-full flex-row flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Chip
                    key={suggestionKey(suggestion)}
                    accessibilityLabel={suggestion.title}
                    disabled={suggestion.isLoading || isRunning}
                    onPress={() => void sendMessage(suggestion.message)}
                    textClassName="text-secondary"
                    variant="outline"
                  >
                    {suggestion.title}
                  </Chip>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            <View className="gap-3">
              {isRunning && latestMessage?.role === "user" ? <TypingIndicator /> : null}
              <KrogerConnectionCard connection={connection} />
              {error ? (
                <View className="gap-2">
                  <ErrorAlert message={error} />
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
        <MessageScrollerButton />
      </MessageScroller>

      <ChatComposer
        key={composerVersion}
        isRunning={isRunning}
        onOpenMenu={openMenu}
        onSend={sendMessage}
        onStop={stop}
      />
      <ActionSheet
        ref={menuSheetRef}
        actions={[
          { label: "New chat", onPress: () => void newChat() },
          { label: "Saved recipes", onPress: () => openMenuRoute("/saved-recipes") },
          { label: "Chat history", onPress: () => openMenuRoute("/chat-history") },
        ]}
        onCancel={closeMenu}
        title="Conversation"
      />
      <AlertDialog onOpenChange={setCartDialogOpen} open={cartDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add this list to Kroger?</AlertDialogTitle>
            <AlertDialogDescription>
              Grocery Agent will ask Kroger to add the matched items and quantities shown in your
              plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setCartDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setCartDialogOpen(false);
                void sendMessage(
                  "Add every matched item in this grocery list to my Kroger cart now.",
                );
              }}
            >
              Add to cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </KeyboardView>
  );
}

const ChatComposer = memo(function ChatComposer({
  isRunning,
  onOpenMenu,
  onSend,
  onStop,
}: {
  isRunning: boolean;
  onOpenMenu: () => void;
  onSend: (content: string) => Promise<GroceryOperationOutcome>;
  onStop: () => Promise<GroceryOperationOutcome>;
}) {
  const [input, setInput] = useState("");

  const submit = useCallback(
    async (composerContent: string) => {
      if (!composerContent.trim() || isRunning) return;

      setInput("");
      const outcome = await onSend(composerContent);
      if (outcome.status === "failed") {
        setInput((current) => current || composerContent);
      }
    },
    [isRunning, onSend],
  );

  return (
    <SafeArea
      className="flex-none gap-1 border-t border-border bg-background px-3 pt-2.5"
      edges={["bottom"]}
    >
      <PromptInput
        className="min-h-24 p-2.5"
        clearOnSend={false}
        onChangeText={setInput}
        onSend={(content) => void submit(content)}
        onStop={onStop}
        streaming={isRunning}
        value={input}
      >
        <PromptInputTextarea
          accessibilityLabel="Ask Grocery Agent"
          className="px-1.5 py-1.5"
          maxLength={2000}
          placeholder="Ask for meals or groceries…"
        />
        <PromptInputToolbar className="min-h-10 pt-0">
          <PromptInputButton
            accessibilityHint="Opens conversation actions"
            accessibilityLabel="Chat menu"
            className="size-10 min-h-10 min-w-10 p-0"
            onPress={onOpenMenu}
          >
            <Icon as={Menu} className="size-6 text-foreground" strokeWidth={2.5} />
          </PromptInputButton>
          <PromptInputSpacer />
          <PromptInputSend className="size-10 rounded-full" />
        </PromptInputToolbar>
      </PromptInput>
      <Text className="text-center text-xs leading-3.5 text-muted-foreground">
        AI can make mistakes. Review products, prices, and quantities before adding.
      </Text>
    </SafeArea>
  );
});

type GroceryMessageProps = {
  assistantContent?: string;
  connected: boolean;
  isAdding: boolean;
  isLatestGroceryList: boolean;
  isStreaming: boolean;
  markdownStyle: NativeMarkdownStyle;
  message: DisplayMessage;
  onAddToCart: () => void;
  onOpenList: () => void;
  onReasoningDuration: (messageId: string, seconds: number) => void;
  reasoningDuration?: number;
};

const GroceryMessage = memo(
  function GroceryMessage({
    assistantContent,
    connected,
    isAdding,
    isLatestGroceryList,
    isStreaming,
    markdownStyle,
    message,
    onAddToCart,
    onOpenList,
    onReasoningDuration,
    reasoningDuration,
  }: GroceryMessageProps) {
    return (
      <View
        className={cn(
          message.role === "reasoning"
            ? "w-full gap-1 self-stretch"
            : message.role === "user" || message.role === "assistant"
              ? "max-w-88 rounded-3xl px-4 py-3"
              : "w-full self-stretch",
          message.role === "user"
            ? "self-end rounded-br-md bg-secondary"
            : message.role === "assistant"
              ? "self-start rounded-bl-md border border-border bg-card"
              : undefined,
        )}
        collapsable={message.role !== "user"}
        nativeID={message.id}
      >
        {message.role === "user" ? (
          <Text className="text-sm leading-5.5 text-secondary-foreground" selectable>
            {message.content}
          </Text>
        ) : message.role === "reasoning" ? (
          <ReasoningSection
            completedDuration={reasoningDuration}
            content={message.content}
            isStreaming={isStreaming}
            messageId={message.id}
            onDurationComplete={onReasoningDuration}
          />
        ) : message.role === "tool" ? (
          <ToolCallSection
            name={message.name}
            parameters={message.parameters}
            result={message.result}
            status={message.status}
          />
        ) : message.role === "grocery-list" ? (
          <GroceryStateCard
            state={message.state}
            adding={isAdding}
            onOpenList={isLatestGroceryList ? onOpenList : undefined}
            onAddToCart={isLatestGroceryList ? onAddToCart : undefined}
            connected={connected}
          />
        ) : (
          <NativeMarkdown isStreaming={isStreaming} style={markdownStyle}>
            {assistantContent ?? message.content}
          </NativeMarkdown>
        )}
      </View>
    );
  },
  (previous, next) =>
    previous.message === next.message &&
    previous.assistantContent === next.assistantContent &&
    previous.connected === next.connected &&
    previous.isAdding === next.isAdding &&
    previous.isLatestGroceryList === next.isLatestGroceryList &&
    previous.isStreaming === next.isStreaming &&
    previous.markdownStyle === next.markdownStyle &&
    previous.onAddToCart === next.onAddToCart &&
    previous.onOpenList === next.onOpenList &&
    previous.onReasoningDuration === next.onReasoningDuration &&
    previous.reasoningDuration === next.reasoningDuration,
);

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
  const { releaseFollow } = useMessageScrollerControls();
  const [expanded, setExpanded] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(completedDuration ?? null);
  const scrollRef = useRef<ScrollView>(null);

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
    <Collapsible
      className="w-full gap-1 self-stretch"
      onOpenChange={(next) => {
        releaseFollow();
        setExpanded(next);
      }}
      open={expanded}
    >
      <CollapsibleTrigger
        accessibilityLabel={expanded ? "Hide reasoning" : "Show reasoning"}
        className="flex-row items-center gap-1 self-start py-1 active:opacity-65"
      >
        <View className="size-4 items-center justify-center">
          {expanded ? (
            <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
          ) : (
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          )}
        </View>
        <Text className="text-xs font-medium text-muted-foreground">{reasoningLabel}</Text>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 h-39 border-l border-border py-1 pl-3.5">
        <ScrollView
          ref={scrollRef}
          nestedScrollEnabled
          onContentSizeChange={() => {
            if (isStreaming) scrollRef.current?.scrollToEnd({ animated: false });
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-sm leading-5 text-muted-foreground" selectable>
            {content}
          </Text>
        </ScrollView>
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
  const { releaseFollow } = useMessageScrollerControls();
  const [expanded, setExpanded] = useState(false);
  const label = toolLabel(name);
  return (
    <Collapsible
      className="w-full gap-1 self-stretch"
      onOpenChange={(next) => {
        releaseFollow();
        setExpanded(next);
      }}
      open={expanded}
    >
      <CollapsibleTrigger
        accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${label}`}
        className="min-h-8 flex-row items-center gap-1 py-1 active:opacity-65"
      >
        <View className="size-4 items-center justify-center">
          {expanded ? (
            <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
          ) : (
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          )}
        </View>
        <Text className="shrink text-xs font-semibold" numberOfLines={1}>
          {label}
        </Text>
        <Text
          className={cn(
            "ml-auto text-xs text-muted-foreground",
            status === "failed" && "text-destructive",
          )}
        >
          {status === "running" ? "Running" : status === "failed" ? "Failed" : "Done"}
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 max-h-39 border-l border-border py-1 pl-3.5">
        <ScrollView nestedScrollEnabled>
          <Text className="mb-0.5 text-xs font-bold text-muted-foreground" selectable>
            Input
          </Text>
          <Text className="mb-2 text-xs leading-4.5 text-muted-foreground" selectable>
            {formatToolValue(parameters)}
          </Text>
          {status !== "running" ? (
            <>
              <Text className="mb-0.5 text-xs font-bold text-muted-foreground" selectable>
                Result
              </Text>
              <Text className="mb-2 text-xs leading-4.5 text-muted-foreground" selectable>
                {formatToolValue(result)}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </CollapsibleContent>
    </Collapsible>
  );
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    set_shopping_list: "Created shopping list",
    set_product_matches: "Matched Kroger products",
    update_cart: "Updated Kroger cart",
    update_pantry: "Updated pantry",
    set_meal_plan: "Created meal plan",
    set_weekly_deals: "Saved weekly deals",
    mark_list_ready: "Prepared grocery list",
    get_current_date: "Checked current date",
    get_weekly_deals: "Checked weekly deals",
    search_products: "Searched Kroger products",
    web_search: "Searched the web",
    load_web_page: "Read web page",
  };
  return (
    labels[name] ??
    name
      .split("_")
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(" ")
  );
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
