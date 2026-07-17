import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react-native";
import { ADD_TO_CART_MESSAGE, AddToCartDialog } from "@/components/add-to-cart-dialog";
import { GroceryStateCard } from "@/components/grocery-state-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import type { GroceryOperationOutcome } from "@/hooks/use-grocery-agent";
import { GROCERY_SUGGESTIONS } from "@/lib/grocery-suggestions";
import { cn } from "@/lib/utils";
import { ScrollView } from "react-native-gesture-handler";
import { SafeArea } from "@/components/ui/safe-area";

export function GroceryChat() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [cartDialogOpen, setCartDialogOpen] = useState(false);
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
  } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const latestMessage = messages.at(-1);

  const openLatestList = useCallback(() => router.push("/list"), [router]);
  const confirmAddToCart = useCallback(() => {
    setCartDialogOpen(true);
  }, []);
  const recordReasoningDuration = useCallback((messageId: string, seconds: number) => {
    setReasoningDurations((current) =>
      current[messageId] === seconds ? current : { ...current, [messageId]: seconds },
    );
  }, []);
  return (
    <SafeArea>
      <KeyboardView behavior="padding">
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4 py-3"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <View className="items-center gap-2.5 px-3 py-6">
              <View className="mb-1 size-14 items-center justify-center rounded-2xl bg-muted">
                <Icon as={Sparkles} className="size-6.5 text-primary" />
              </View>
              <Text className="text-center font-extrabold" variant="h3">
                What are you shopping for?
              </Text>
              <Text className="max-w-88 text-center leading-6 text-muted-foreground">
                Describe a recipe, a weekly budget, or the meals you need. I’ll turn it into a
                practical list you control.
              </Text>
              <View className="mt-2.5 w-full flex-row flex-wrap justify-center gap-2">
                {GROCERY_SUGGESTIONS.map((suggestion) => (
                  <Chip
                    key={suggestion.title}
                    accessibilityLabel={suggestion.title}
                    disabled={isRunning}
                    onPress={() => void send(suggestion.message)}
                    textClassName="text-secondary"
                    variant="outline"
                  >
                    {suggestion.title}
                  </Chip>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) => {
              switch (message.role) {
                case "reasoning":
                  return (
                    <AssistantMessage key={message.id} id={message.id}>
                      <ReasoningSection
                        completedDuration={reasoningDurations[message.id]}
                        content={message.content}
                        isStreaming={isStreaming && message.id === latestMessage?.id}
                        messageId={message.id}
                        onDurationComplete={recordReasoningDuration}
                      />
                    </AssistantMessage>
                  );
                case "tool":
                  return (
                    <AssistantMessage key={message.id} id={message.id}>
                      <ToolCallSection
                        name={message.name}
                        parameters={message.parameters}
                        result={message.result}
                        status={message.status}
                      />
                    </AssistantMessage>
                  );
                case "user":
                  return <UserMessage key={message.id} content={message.content} id={message.id} />;
                case "assistant":
                  return (
                    <AssistantMessage key={message.id} id={message.id}>
                      <View className="max-w-3/4 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5">
                        <MarkdownText className="min-w-0 self-start" content={message.content} />
                      </View>
                    </AssistantMessage>
                  );
              }
            })
          )}
          <GroceryStateCard
            state={state}
            adding={isRunning}
            connected={connected}
            onOpenList={openLatestList}
            onAddToCart={confirmAddToCart}
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
        </ScrollView>
        <View className="gap-2 border-t border-border px-4 py-3">
          <ChatComposer isRunning={isRunning} onSend={send} onStop={stop} />
        </View>
      </KeyboardView>
      <AddToCartDialog
        open={cartDialogOpen}
        onOpenChange={setCartDialogOpen}
        onConfirm={() => void send(ADD_TO_CART_MESSAGE)}
      />
    </SafeArea>
  );
}

const UserMessage = memo(function UserMessage({ content, id }: { content: string; id: string }) {
  return (
    <View className="mb-3 w-full items-end" nativeID={id}>
      <View className="max-w-3/4 rounded-2xl rounded-br-sm bg-primary px-4 py-2.5">
        <Text className="text-end text-sm leading-relaxed text-primary-foreground">{content}</Text>
      </View>
    </View>
  );
});

const AssistantMessage = memo(function AssistantMessage({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  return (
    <View className="mb-3 w-full items-start" collapsable nativeID={id}>
      {children}
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
    <PromptInput
      clearOnSend={false}
      onChangeText={setInput}
      onSend={(content) => void submit(content)}
      onStop={() => void onStop()}
      streaming={isRunning}
      value={input}
    >
      <PromptInputTextarea />
      <PromptInputToolbar>
        <PromptInputSpacer />
        <PromptInputSend />
      </PromptInputToolbar>
    </PromptInput>
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
        className="flex-row items-center gap-1 self-start py-1 active:opacity-65"
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
        className="min-h-8 flex-row items-center gap-1 py-1 active:opacity-65"
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
      <CollapsibleContent className="ml-2 max-h-39 border-l border-border py-1 pl-3.5">
        <ScrollView nestedScrollEnabled>
          <Text className="mb-0.5 font-semibold text-muted-foreground" variant="small">
            Input
          </Text>
          <Text className="mb-2 leading-4.5" variant="muted">
            {formatToolValue(parameters)}
          </Text>
          {status !== "running" ? (
            <>
              <Text className="mb-0.5 font-semibold text-muted-foreground" variant="small">
                Result
              </Text>
              <Text className="mb-2 leading-4.5" variant="muted">
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
