import { useAuth } from "@clerk/clerk-expo";
import { useAgent, useCopilotKit } from "@copilotkit/react-native";
import { useCallback, useRef, useState } from "react";
import { runAuthenticated, readableError } from "@/lib/auth";
import { normalizeGroceryState, toDisplayMessages } from "@/lib/grocery-state";

export function useGroceryAgentController(onRunComplete: () => void) {
  const { agent } = useAgent({ agentId: "grocery", throttleMs: 0 });
  const { copilotkit } = useCopilotKit();
  const { getToken, userId } = useAuth();
  const [error, setError] = useState("");
  const conversationVersion = useRef(0);
  const activeRun = useRef<Promise<unknown> | null>(null);

  // CopilotKit mutates the active message while SSE chunks arrive. Derive the
  // display snapshot on every hook render so each streamed chunk is visible.
  const messages = toDisplayMessages(agent?.messages ?? []);
  const state = normalizeGroceryState(agent?.state);
  const isRunning = agent?.isRunning ?? false;
  const clearError = useCallback(() => setError(""), []);

  const send = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || !agent || isRunning) return false;
      const version = conversationVersion.current;
      setError("");
      let runPromise: Promise<unknown> | null = null;
      try {
        runPromise = runAuthenticated({
          transport: copilotkit,
          getToken,
          userId,
          run: () => {
            agent.addMessage({
              id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              role: "user",
              content,
            });
            return copilotkit.runAgent({ agent });
          },
        });
        activeRun.current = runPromise;
        await runPromise;
        onRunComplete();
        return true;
      } catch (caught) {
        if (conversationVersion.current === version) setError(readableError(caught));
        return false;
      } finally {
        if (activeRun.current === runPromise) activeRun.current = null;
      }
    },
    [agent, copilotkit, getToken, isRunning, onRunComplete, userId],
  );

  const startNewChat = useCallback(async () => {
    if (!agent) return false;

    conversationVersion.current += 1;
    if (agent.isRunning) {
      copilotkit.stopAgent({ agent });
      try {
        await activeRun.current;
      } catch {
        // An intentional cancellation rejects the current run before reset.
      }
    }
    agent.threadId = `grocery_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    agent.pendingInterrupts = [];
    agent.setMessages([]);
    agent.setState({});
    setError("");
    return true;
  }, [agent, copilotkit]);

  const openThread = useCallback(
    async (threadId: string) => {
      const nextThreadId = threadId.trim();
      if (!agent || !nextThreadId) return false;
      if (agent.threadId === nextThreadId) return true;

      conversationVersion.current += 1;
      if (agent.isRunning) {
        copilotkit.stopAgent({ agent });
        try {
          await activeRun.current;
        } catch {
          // An intentional cancellation rejects the current run before replay.
        }
      }

      setError("");
      const previousThreadId = agent.threadId;
      const previousInterrupts = agent.pendingInterrupts;
      agent.threadId = nextThreadId;
      agent.pendingInterrupts = [];
      try {
        await runAuthenticated({
          transport: copilotkit,
          getToken,
          userId,
          run: () => copilotkit.connectAgent({ agent }),
        });
        return true;
      } catch (caught) {
        agent.threadId = previousThreadId;
        agent.pendingInterrupts = previousInterrupts;
        setError(readableError(caught));
        return false;
      }
    },
    [agent, copilotkit, getToken, userId],
  );

  return {
    activeThreadId: agent?.threadId,
    state,
    messages,
    isRunning,
    error,
    clearError,
    send,
    startNewChat,
    openThread,
  };
}
