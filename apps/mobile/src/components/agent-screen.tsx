import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { useAuth } from "@clerk/clerk-expo";
import type {
  A2UIState,
  FitnessState,
  GroceryState,
  TripState,
  WellnessState,
} from "@agents/types";
import { getAgentUrl, type AgentId } from "@/utils/agent-config";
import { useAgent } from "@/utils/use-agent";

type AgentState = TripState | GroceryState | FitnessState | WellnessState | A2UIState;

type AgentScreenConfig<TState extends AgentState> = {
  id: AgentId;
  title: string;
  subtitle: string;
  placeholder: string;
  accentColor: string;
  renderSummary: (state: TState) => React.ReactNode;
};

type Props<TState extends AgentState> = {
  config: AgentScreenConfig<TState>;
  initialState: TState;
};

function connectionHeaders(userId: string | null | undefined, token: string | null) {
  const headers: Record<string, string> = {};
  if (userId) headers["x-clerk-user-id"] = userId;
  if (token) headers.authorization = `Bearer ${token}`;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function AgentScreen<TState extends AgentState>({ config, initialState }: Props<TState>) {
  const { getToken, userId } = useAuth();
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const headers = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return connectionHeaders(userId, token);
  }, [getToken, userId]);
  const url = useMemo(() => getAgentUrl(config.id), [config.id]);

  const { messages, state, isLoading, error, sendMessage } = useAgent<TState>(
    { url, headers, enableA2UI: config.id === "a2ui" },
    initialState,
  );

  const onSend = () => {
    const text = input;
    setInput("");
    void sendMessage(text);
  };

  const summary = config.renderSummary(state);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { borderTopColor: config.accentColor }]}>
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
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.agentBubble]}
          >
            <Text
              selectable
              style={[styles.bubbleText, m.role === "user" ? styles.userText : styles.agentText]}
            >
              {m.content}
            </Text>
          </View>
        ))}
        {isLoading && <ActivityIndicator style={styles.loading} />}
        {error ? (
          <Text selectable style={styles.error}>
            {error}
          </Text>
        ) : null}
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

export function SummaryCard({ children }: { children: React.ReactNode }) {
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
  agentText: { color: "#111" },
  loading: { margin: 12 },
  error: { color: "#c0392b", fontSize: 13, margin: 12, textAlign: "center" },
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
