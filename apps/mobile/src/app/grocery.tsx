import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { GroceryState } from "@agents/types";
import { useAuth } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { useAgent } from "@/utils/use-agent";

const GROCERY_AGENT_URL =
  Constants.expoConfig?.extra?.groceryAgentUrl ??
  process.env.EXPO_PUBLIC_GROCERY_AGENT_URL ??
  "http://localhost:8001/";

export default function GroceryScreen() {
  const { userId } = useAuth();
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // Forward the Clerk identity the same way the web copilotkit route does.
  const headers = useMemo(() => (userId ? { "x-clerk-user-id": userId } : undefined), [userId]);

  const { messages, state, isLoading, error, sendMessage } = useAgent<GroceryState>(
    { url: GROCERY_AGENT_URL, headers },
    {},
  );

  const onSend = () => {
    const text = input;
    setInput("");
    sendMessage(text);
  };

  const list = state.shopping_list ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {list.length > 0 && (
        <ScrollView horizontal style={styles.chipRow} showsHorizontalScrollIndicator={false}>
          {list.map((item, i) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {list.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Grocery Planner</Text>
          <Text style={styles.emptySubtitle}>Ask me to plan meals or build a shopping list.</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.agentBubble]}
          >
            <Text
              style={[styles.bubbleText, m.role === "user" ? styles.userText : styles.agentText]}
            >
              {m.content}
            </Text>
          </View>
        ))}
        {isLoading && <ActivityIndicator style={{ margin: 12 }} />}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Plan meals, find deals…"
          placeholderTextColor="#999"
          onSubmitEditing={onSend}
          returnKeyType="send"
          multiline
        />
        <Pressable style={styles.sendButton} onPress={onSend}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  chipRow: {
    maxHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  chip: {
    backgroundColor: "#f0f0f0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipText: { fontSize: 13, color: "#333" },
  emptyState: { padding: 24, alignItems: "center" },
  emptyTitle: { fontSize: 22, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, color: "#999", marginTop: 4 },
  messageList: { flex: 1, paddingHorizontal: 12 },
  bubble: { marginVertical: 4, padding: 10, borderRadius: 12, maxWidth: "85%" },
  userBubble: { backgroundColor: "#000", alignSelf: "flex-end" },
  agentBubble: { backgroundColor: "#f0f0f0", alignSelf: "flex-start" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: "#fff" },
  agentText: { color: "#111" },
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
    backgroundColor: "#000",
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
