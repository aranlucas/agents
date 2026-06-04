import { HttpAgent } from "@ag-ui/client";
import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Thin React Native wrapper around the AG-UI `HttpAgent` client.
 *
 * Mirrors the web data flow (apps/web → @ag-ui/client → Railway agent) but for
 * Expo: the screen owns a single long-lived `HttpAgent`, streams assistant
 * tokens via `onMessagesChanged`, and reads the agent's shared ADK state via
 * `onStateChanged` (the client applies snapshots + JSON-patch deltas for us).
 */

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type AgentMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type UseAgentOptions = {
  /** AG-UI endpoint of the ADK agent service. */
  url: string;
  /** Extra headers (e.g. Clerk identity) sent with every run. */
  headers?: Record<string, string>;
};

// AG-UI messages are a union (text, tool calls, results). We only surface the
// human-readable text bubbles to the UI.
function toAgentMessage(message: {
  id?: string | number;
  role?: string;
  content?: unknown;
}): AgentMessage {
  return {
    id: String(message.id ?? Math.random().toString(36).slice(2)),
    role: (message.role ?? "assistant") as ChatRole,
    content: typeof message.content === "string" ? message.content : "",
  };
}

export function useAgent<TState extends Record<string, unknown>>(
  options: UseAgentOptions,
  initialState: TState,
) {
  const { url, headers } = options;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [state, setState] = useState<TState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable identity for the headers object so the agent is only recreated when
  // the endpoint or auth headers actually change.
  const headerKey = JSON.stringify(headers ?? {});
  const initialStateRef = useRef(initialState);

  const agent = useMemo(() => {
    const instance = new HttpAgent({ url, headers });
    instance.state = initialStateRef.current as Record<string, unknown>;
    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, headerKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isLoading) return;

      setError(null);
      setIsLoading(true);

      const userMessage: AgentMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content,
      };
      // Optimistically render the user's bubble, and seed the agent's history so
      // the next run includes it.
      setMessages((prev) => [...prev, userMessage]);
      agent.messages = [...agent.messages, userMessage as never];

      try {
        await agent.runAgent({ runId: `run_${Date.now()}` }, {
          // Fires on every streamed token and message mutation.
          onMessagesChanged: ({ messages: next }: { messages: unknown[] }) => {
            setMessages(
              (next as Parameters<typeof toAgentMessage>[0][])
                .map(toAgentMessage)
                .filter(
                  (m) => (m.role === "user" || m.role === "assistant") && m.content.length > 0,
                ),
            );
          },
          // Client has already applied snapshots + JSON-patch deltas here.
          onStateChanged: ({ state: next }: { state: TState }) => {
            if (next) setState((prev) => ({ ...prev, ...next }));
          },
          onRunErrorEvent: () => {
            setError("Connection error. Is the agent running?");
          },
        } as never);
      } catch {
        setError("Connection error. Is the agent running?");
      } finally {
        setIsLoading(false);
      }
    },
    [agent, isLoading],
  );

  return { messages, state, isLoading, error, sendMessage };
}
