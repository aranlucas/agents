import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowUp,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Menu,
  MessageSquareText,
  Plus,
  Sparkles,
} from "lucide-react-native";
import { NativeMarkdown, type NativeMarkdownStyle } from "@agents/native-markdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroceryStateCard } from "@/components/grocery-state-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
  type MessageScrollerHandle,
  useMessageScrollerControls,
} from "@/components/message-scroller";
import { InlineError } from "@/components/ui";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { suggestionKey } from "@/lib/grocery-suggestions";
import { colors } from "@/lib/theme";

export function GroceryChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<MessageScrollerHandle>(null);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    state,
    messages,
    isRunning,
    error,
    clearError,
    send,
    startNewChat,
    suggestions,
    suggestionsLoading,
  } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const latestAssistant = messages.findLast((message) => message.role === "assistant");
  const latestReasoning = messages.findLast((message) => message.role === "reasoning");
  const latestGroceryList = messages.findLast((message) => message.role === "grocery-list");
  const timelineRevision = `${messages.length}:${messages.reduce(
    (length, message) => length + ("content" in message ? message.content.length : 0),
    0,
  )}:${messages.at(-1)?.id ?? ""}`;

  const submit = async (content = input) => {
    if (await send(content)) setInput("");
  };

  const newChat = async () => {
    setMenuOpen(false);
    if (!(await startNewChat())) return;
    setInput("");
    scrollRef.current?.scrollToStart();
  };

  const openMenuRoute = (route: "/saved-recipes" | "/chat-history") => {
    setMenuOpen(false);
    router.push(route);
  };

  const confirmAddToCart = () => {
    Alert.alert(
      "Add this list to Kroger?",
      "Grocery Agent will ask Kroger to add the matched items and quantities shown in your plan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add to cart",
          onPress: () =>
            void submit("Add every matched item in this grocery list to my Kroger cart now."),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={92}
    >
      <MessageScroller ref={scrollRef} autoScroll revision={timelineRevision}>
        <MessageScrollerViewport
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <MessageScrollerContent style={styles.messageContent}>
            {messages.length === 0 ? (
              <View style={styles.welcome}>
                <View style={styles.sparkle}>
                  <Sparkles color={colors.green} size={26} />
                </View>
                <Text selectable style={styles.welcomeTitle}>
                  What are you shopping for?
                </Text>
                <Text selectable style={styles.welcomeText}>
                  Describe a recipe, a weekly budget, or the meals you need. I’ll turn it into a
                  practical list you control.
                </Text>
                <View style={styles.starters}>
                  {suggestionsLoading && suggestions.length === 0 ? (
                    <View accessibilityRole="progressbar" style={styles.suggestionLoading}>
                      <ActivityIndicator color={colors.green} size="small" />
                      <Text style={styles.suggestionLoadingText}>Finding a few ideas…</Text>
                    </View>
                  ) : null}
                  {suggestions.map((suggestion) => (
                    <Pressable
                      key={suggestionKey(suggestion)}
                      accessibilityLabel={suggestion.title}
                      accessibilityRole="button"
                      disabled={suggestion.isLoading || isRunning}
                      onPress={() => void submit(suggestion.message)}
                      style={({ pressed }) => [styles.starter, pressed && styles.starterPressed]}
                    >
                      <Text style={styles.starterText}>{suggestion.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
                style={[
                  message.role === "reasoning"
                    ? styles.reasoning
                    : message.role === "user" || message.role === "assistant"
                      ? styles.bubble
                      : styles.timelineItem,
                  message.role === "user"
                    ? styles.userBubble
                    : message.role === "assistant"
                      ? styles.agentBubble
                      : null,
                ]}
              >
                {message.role === "user" ? (
                  <Text selectable style={[styles.bubbleText, styles.userText]}>
                    {message.content}
                  </Text>
                ) : message.role === "reasoning" ? (
                  <ReasoningSection
                    key={isRunning && message.id === latestReasoning?.id ? "streaming" : "complete"}
                    content={message.content}
                    isStreaming={isRunning && message.id === latestReasoning?.id}
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
                    adding={isRunning && message.id === latestGroceryList?.id}
                    onOpenList={
                      message.id === latestGroceryList?.id ? () => router.push("/list") : undefined
                    }
                    onAddToCart={
                      message.id === latestGroceryList?.id ? confirmAddToCart : undefined
                    }
                    connected={connected}
                  />
                ) : (
                  <NativeMarkdown style={markdownStyle}>
                    {message.id === latestAssistant?.id && state.status === "ready"
                      ? state.review_summary || "Your grocery list is ready to review."
                      : message.content}
                  </NativeMarkdown>
                )}
              </MessageScrollerItem>
            ))}

            <KrogerConnectionCard connection={connection} />
            {error ? (
              <Pressable onPress={clearError}>
                <InlineError message={error} />
              </Pressable>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        transparent
        visible={menuOpen}
      >
        <View accessibilityViewIsModal style={styles.menuLayer}>
          <Pressable
            accessibilityLabel="Close chat menu"
            onPress={() => setMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View accessibilityRole="menu" style={styles.chatMenu}>
            <Pressable
              accessibilityHint="Stops the current response and starts a fresh conversation"
              accessibilityLabel="New chat"
              accessibilityRole="menuitem"
              onPress={() => void newChat()}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Plus color={colors.ink} size={28} strokeWidth={2} />
              <Text style={styles.menuTitle}>New chat</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              accessibilityLabel="Saved recipes"
              accessibilityRole="menuitem"
              onPress={() => openMenuRoute("/saved-recipes")}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <BookMarked color={colors.ink} size={25} strokeWidth={2} />
              <Text style={styles.menuTitle}>Saved recipes</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              accessibilityLabel="Chat history"
              accessibilityRole="menuitem"
              onPress={() => openMenuRoute("/chat-history")}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <MessageSquareText color={colors.ink} size={25} strokeWidth={2} />
              <Text style={styles.menuTitle}>Chat history</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Ask Grocery Agent"
            multiline
            maxLength={2000}
            placeholder="Ask for meals or groceries…"
            placeholderTextColor="#7b847c"
            style={styles.input}
            value={input}
            onChangeText={setInput}
          />
          <View style={styles.composerActions}>
            <Pressable
              accessibilityLabel="Chat menu"
              accessibilityRole="button"
              accessibilityHint="Opens conversation actions"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => {
                Keyboard.dismiss();
                setMenuOpen((current) => !current);
              }}
              style={({ pressed }) => [
                styles.newChat,
                menuOpen && styles.menuButtonOpen,
                pressed && styles.newChatPressed,
              ]}
            >
              <Menu color={colors.ink} size={25} strokeWidth={2.5} />
            </Pressable>
            <Pressable
              accessibilityLabel="Send"
              accessibilityRole="button"
              disabled={!input.trim() || isRunning}
              onPress={() => void submit()}
              style={[styles.send, (!input.trim() || isRunning) && styles.sendDisabled]}
            >
              <ArrowUp color={colors.white} size={20} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.finePrint}>
          AI can make mistakes. Review products, prices, and quantities before adding.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function ReasoningSection({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const { releaseFollow } = useMessageScrollerControls();
  const [expanded, setExpanded] = useState(isStreaming);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.reasoning}>
      <Pressable
        accessibilityLabel={expanded ? "Hide reasoning" : "Show reasoning"}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => {
          releaseFollow();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [styles.reasoningToggle, pressed && styles.reasoningTogglePressed]}
      >
        <View style={styles.disclosureIcon}>
          {expanded ? (
            <ChevronDown color={colors.muted} size={16} />
          ) : (
            <ChevronRight color={colors.muted} size={16} />
          )}
        </View>
        <Text style={styles.reasoningLabel}>{isStreaming ? "Working…" : "Worked"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.reasoningContent}>
          <ScrollView
            ref={scrollRef}
            nestedScrollEnabled
            onContentSizeChange={() => {
              if (isStreaming) scrollRef.current?.scrollToEnd({ animated: false });
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text selectable style={styles.reasoningText}>
              {content}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
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
    <View style={styles.toolCall}>
      <Pressable
        accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => {
          releaseFollow();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [styles.toolToggle, pressed && styles.reasoningTogglePressed]}
      >
        <View style={styles.disclosureIcon}>
          {expanded ? (
            <ChevronDown color={colors.muted} size={16} />
          ) : (
            <ChevronRight color={colors.muted} size={16} />
          )}
        </View>
        <Text numberOfLines={1} style={styles.toolLabel}>
          {label}
        </Text>
        <Text style={[styles.toolStatus, status === "failed" && styles.toolStatusFailed]}>
          {status === "running" ? "Running" : status === "failed" ? "Failed" : "Done"}
        </Text>
      </Pressable>
      {expanded ? (
        <ScrollView nestedScrollEnabled style={styles.toolDetails}>
          <Text selectable style={styles.toolDetailsLabel}>
            Input
          </Text>
          <Text selectable style={styles.toolDetailsText}>
            {formatToolValue(parameters)}
          </Text>
          {status !== "running" ? (
            <>
              <Text selectable style={styles.toolDetailsLabel}>
                Result
              </Text>
              <Text selectable style={styles.toolDetailsText}>
                {formatToolValue(result)}
              </Text>
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  messageContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 12 },
  welcome: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 24, gap: 10 },
  sparkle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    marginBottom: 4,
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  welcomeText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 350,
  },
  starters: { width: "100%", gap: 8, marginTop: 10 },
  starter: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  starterPressed: { backgroundColor: colors.surfaceMuted },
  starterText: { color: colors.forest, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  suggestionLoading: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  suggestionLoadingText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 20,
    borderCurve: "continuous",
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  userBubble: { backgroundColor: colors.forest, alignSelf: "flex-end", borderBottomRightRadius: 6 },
  agentBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 6,
  },
  bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  userText: { color: colors.white },
  timelineItem: { width: "100%", alignSelf: "stretch" },
  reasoning: { width: "100%", alignSelf: "stretch", gap: 4 },
  reasoningToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
  },
  reasoningTogglePressed: { opacity: 0.65 },
  reasoningLabel: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  disclosureIcon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  reasoningContent: {
    height: 156,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    marginLeft: 7,
    paddingLeft: 13,
    paddingVertical: 3,
  },
  reasoningText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  toolCall: { width: "100%", alignSelf: "stretch", gap: 4 },
  toolToggle: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
  },
  toolLabel: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "600", flexShrink: 1 },
  toolStatus: { color: colors.muted, fontSize: 11, lineHeight: 16, marginLeft: "auto" },
  toolStatusFailed: { color: colors.danger },
  toolDetails: {
    maxHeight: 156,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    marginLeft: 7,
    paddingLeft: 13,
    paddingVertical: 3,
  },
  toolDetailsLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  toolDetailsText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  menuLayer: { flex: 1 },
  chatMenu: {
    position: "absolute",
    left: 20,
    bottom: 48,
    width: 244,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    borderCurve: "continuous",
    paddingVertical: 5,
    overflow: "hidden",
    boxShadow: "0 8px 28px rgba(15, 35, 21, 0.16)",
  },
  menuItem: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  menuItemPressed: { backgroundColor: colors.surfaceMuted },
  menuDivider: { height: 1, backgroundColor: colors.line },
  menuTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "500" },
  composerWrap: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 5,
  },
  composer: {
    minHeight: 94,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
    padding: 9,
    gap: 3,
  },
  input: {
    minHeight: 40,
    maxHeight: 112,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  composerActions: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  newChat: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButtonOpen: { backgroundColor: colors.surfaceMuted },
  newChatPressed: { backgroundColor: colors.surfaceMuted },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: "#a8b2a9" },
  finePrint: { color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: "center" },
});

const markdownStyle: NativeMarkdownStyle = {
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  link: { color: colors.green },
  blockquote: { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
  table: { borderColor: colors.line },
  thead: { backgroundColor: colors.surfaceMuted },
  tr: { borderColor: colors.line },
  code_inline: { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
  code_block: { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
  fence: { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
};
