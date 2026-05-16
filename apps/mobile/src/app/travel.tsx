import React, { useEffect, useRef, useState } from "react";
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
import { TripState } from "@agents/types";
import Constants from "expo-constants";

const TRAVEL_AGENT_URL =
  Constants.expoConfig?.extra?.travelAgentUrl ??
  process.env.EXPO_PUBLIC_TRAVEL_AGENT_URL ??
  "http://localhost:8000/";

type Message = { role: "user" | "assistant"; content: string };

export default function TravelScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tripState, setTripState] = useState<TripState>({});
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch(TRAVEL_AGENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMsg }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          state: tripState,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.content) {
          setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
        }
        if (data.state) setTripState((prev) => ({ ...prev, ...data.state }));
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Is the agent running?" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {tripState.destination ? (
        <View style={styles.tripCard}>
          <Text style={styles.tripDestination}>{tripState.destination}</Text>
          {tripState.headline ? (
            <Text style={styles.tripHeadline}>{tripState.headline}</Text>
          ) : null}
          {tripState.start_date && tripState.end_date ? (
            <Text style={styles.tripDates}>
              {tripState.start_date} → {tripState.end_date}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Trip Planner</Text>
          <Text style={styles.emptySubtitle}>Tell me where you want to go.</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.agentBubble]}
          >
            <Text style={[styles.bubbleText, m.role === "user" ? styles.userText : styles.agentText]}>
              {m.content}
            </Text>
          </View>
        ))}
        {isLoading && <ActivityIndicator style={{ margin: 12 }} />}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Plan a trip…"
          placeholderTextColor="#999"
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          multiline
        />
        <Pressable style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  tripCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  tripDestination: { fontSize: 20, fontWeight: "700" },
  tripHeadline: { fontSize: 14, color: "#666", marginTop: 2 },
  tripDates: { fontSize: 12, color: "#999", marginTop: 4 },
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
  inputRow: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#eee", gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: "#f5f5f5", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#111" },
  sendButton: { backgroundColor: "#000", borderRadius: 20, paddingHorizontal: 16, justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
