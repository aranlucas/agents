import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@clerk/expo";
import {
  useAgent,
  useCopilotKit,
  useRenderToolCall,
  type ToolCall,
} from "@copilotkit/react-native/headless";
import { NativeMarkdown, type NativeMarkdownStyle } from "@agents/native-markdown";
import type { FitnessState, GroceryState, TripState, WellnessState } from "@agents/types";
import type { AgentId } from "@/utils/agent-config";
import { runWithCurrentClerkToken } from "@/utils/copilotkit-auth";

type AgentState = TripState | GroceryState | FitnessState | WellnessState;

type AgentScreenConfig<TState extends AgentState> = {
  id: AgentId;
  title: string;
  subtitle: string;
  placeholder: string;
  accentColor: string;
  renderSummary: (state: TState) => ReactNode;
};

type Props<TState extends AgentState> = {
  config: AgentScreenConfig<TState>;
  initialState: TState;
};

type DisplayMessage = { id: string; role: "user" | "assistant"; content: string };
type DisplayToolCall = {
  id: string;
  kind: "tool-call";
  toolCall: ToolCall;
};
type DisplayItem = DisplayMessage | DisplayToolCall;

function toDisplayItems(m: unknown, index: number): DisplayItem[] {
  if (typeof m !== "object" || m === null) return [];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const msg = m as Record<string, unknown>;
  const role = msg.role;
  if (role !== "user" && role !== "assistant") return [];
  const content = msg.content;
  const id = typeof msg.id === "string" ? msg.id : `${role}-${index}`;
  const items: DisplayItem[] = [];
  if (typeof content === "string" && content.length > 0) {
    items.push({ id, role, content });
  }
  if (role !== "assistant" || !Array.isArray(msg.toolCalls)) return items;
  for (const [toolIndex, value] of msg.toolCalls.entries()) {
    if (typeof value !== "object" || value === null) continue;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const toolCall = value as Record<string, unknown>;
    const fn = toolCall.function;
    if (typeof fn !== "object" || fn === null) continue;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const functionCall = fn as Record<string, unknown>;
    if (typeof functionCall.name !== "string") continue;
    const callId = typeof toolCall.id === "string" ? toolCall.id : `${id}-tool-${toolIndex}`;
    // Arguments stay raw here; useRenderToolCall parses them and tolerates the
    // partial JSON a streaming response produces.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const raw = {
      id: callId,
      type: "function",
      function: {
        name: functionCall.name,
        arguments: typeof functionCall.arguments === "string" ? functionCall.arguments : "{}",
      },
    } as ToolCall;
    items.push({ id: callId, kind: "tool-call", toolCall: raw });
  }
  return items;
}

export function AgentScreen<TState extends AgentState>({ config, initialState }: Props<TState>) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const { agent } = useAgent({ agentId: config.id });
  const { copilotkit } = useCopilotKit();
  const renderToolCall = useRenderToolCall();
  const { getToken, userId } = useAuth();

  const messages = (agent?.messages ?? []).flatMap(toDisplayItems);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = (agent?.state ?? initialState) as TState;
  const isLoading = agent?.isRunning ?? false;

  const onSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isLoading || !agent) return;
    try {
      await runWithCurrentClerkToken({
        copilotkit,
        getToken,
        userId,
        run: () => {
          setInput("");
          agent.addMessage({
            id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            role: "user",
            content,
          });
          return copilotkit.runAgent({ agent });
        },
      });
    } catch (error) {
      console.error("Unable to start authenticated agent run", error);
    }
  }, [input, isLoading, agent, copilotkit, getToken, userId]);

  const summary = config.renderSummary(state);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { borderTopColor: config.accentColor }]}>
        {/* eslint-disable-next-line typescript/prefer-nullish-coalescing */}
        {summary ? (
          summary
        ) : (
          <View style={styles.emptyState}>
            <Text selectable style={styles.emptyTitle}>
              {config.title}
            </Text>
            <Text selectable style={styles.emptySubtitle}>
              {config.subtitle}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, index) => {
          if ("kind" in m) {
            const rendered = renderToolCall({ toolCall: m.toolCall });
            return rendered ? (
              <View key={m.id} style={styles.toolCall}>
                {rendered}
              </View>
            ) : null;
          }
          return (
            <View
              key={m.id}
              style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.agentBubble]}
            >
              {m.role === "user" ? (
                <Text selectable style={[styles.bubbleText, styles.userText]}>
                  {m.content}
                </Text>
              ) : (
                <NativeMarkdown
                  isStreaming={isLoading && index === messages.length - 1}
                  style={markdownStyle}
                >
                  {m.content}
                </NativeMarkdown>
              )}
            </View>
          );
        })}
        {isLoading && <ActivityIndicator style={styles.loading} />}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={config.placeholder}
          placeholderTextColor="#777"
          onSubmitEditing={onSend}
          returnKeyType="send"
          multiline
        />
        <Pressable
          style={[styles.sendButton, { backgroundColor: config.accentColor }]}
          onPress={onSend}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, value }: { label: string; value?: string | number | boolean }) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text selectable style={styles.fieldValue}>
        {String(value)}
      </Text>
    </View>
  );
}

export function SummaryCard({ children }: { children: ReactNode }) {
  return <View style={styles.summaryCard}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    borderTopWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    backgroundColor: "#fff",
  },
  emptyState: { padding: 24, alignItems: "center", gap: 4 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#111" },
  emptySubtitle: { fontSize: 14, color: "#777", textAlign: "center" },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 12, paddingVertical: 8 },
  bubble: { marginVertical: 4, padding: 10, borderRadius: 12, maxWidth: "85%" },
  userBubble: { backgroundColor: "#111", alignSelf: "flex-end" },
  agentBubble: { backgroundColor: "#f0f0f0", alignSelf: "flex-start" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: "#fff" },
  loading: { margin: 12 },
  toolCall: { alignSelf: "stretch", marginVertical: 6 },
  inputRow: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111",
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  summaryCard: { padding: 16, gap: 10 },
  field: { gap: 2 },
  fieldLabel: { color: "#777", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  fieldValue: { color: "#111", fontSize: 15, lineHeight: 20 },
});

const markdownStyle: NativeMarkdownStyle = {
  body: { color: "#111", fontSize: 14, lineHeight: 20 },
  table: { borderColor: "#d8d8d8" },
  thead: { backgroundColor: "#e4e4e4" },
  tr: { borderColor: "#d8d8d8" },
  code_inline: { backgroundColor: "#e4e4e4", borderColor: "#d8d8d8" },
  code_block: { backgroundColor: "#e4e4e4", borderColor: "#d8d8d8" },
  fence: { backgroundColor: "#e4e4e4", borderColor: "#d8d8d8" },
};
