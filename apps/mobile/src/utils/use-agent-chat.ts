import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStreamingStore } from "@/components/chat/streaming-store";
import type { ChatContextValue } from "@/components/chat/chat-context";
import type { ChatMessage } from "@/components/chat/types";
import { useAgent } from "./use-agent";

type UseAgentChatOptions = {
  url: string;
  headers?: Record<string, string>;
};

/**
 * Wraps `useAgent` and adapts its output to the `ChatContextValue` shape
 * expected by the chat component system, including streaming store support.
 */
export function useAgentChat<TState extends Record<string, unknown>>(
  options: UseAgentChatOptions,
  initialState: TState,
): ChatContextValue & { state: TState } {
  const [input, setInput] = useState("");
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const prevContentRef = useRef("");

  const {
    messages: rawMessages,
    state,
    isLoading,
    error,
    sendMessage,
  } = useAgent<TState>(options, initialState);

  // While the agent is streaming, expose the last assistant message with
  // content="" so the Conversation renders <StreamingMessage> instead of
  // <MessageResponse> (the actual text is pushed to the streaming store below).
  const messages: ChatMessage[] = useMemo(() => {
    return rawMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m, i, arr) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: isLoading && m.role === "assistant" && i === arr.length - 1 ? "" : m.content,
      }));
  }, [rawMessages, isLoading]);

  // Keep the streaming store in sync with the growing assistant content.
  useEffect(() => {
    if (!isLoading) {
      if (prevContentRef.current) {
        prevContentRef.current = "";
        streamingStore.set("");
      }
      return;
    }
    const last = rawMessages[rawMessages.length - 1];
    if (last?.role === "assistant" && last.content !== prevContentRef.current) {
      prevContentRef.current = last.content;
      streamingStore.set(last.content);
    }
  }, [rawMessages, isLoading, streamingStore]);

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    void sendMessage(text);
  }, [input, isLoading, sendMessage]);

  return {
    messages,
    input,
    setInput,
    isGenerating: isLoading,
    onSend,
    streamingStore,
    error: error ? new Error(error) : null,
    state,
  };
}
