import { HttpAgent, type AgentSubscriber, type Message } from "@ag-ui/client";
import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Thin React Native wrapper around the AG-UI `HttpAgent` client.
 *
 * Mirrors the web data flow (apps/web → @ag-ui/client → Railway agent) but for
 * Expo: the screen owns a single long-lived `HttpAgent`, streams assistant
 * tokens via `onMessagesChanged`, and reads the agent's shared ADK state via
 * `onStateChanged` (the client applies snapshots + JSON-patch deltas for us).
 */

export type ChatRole = "user" | "assistant" | "system" | "tool" | "activity";

const CHAT_ROLES: readonly ChatRole[] = ["user", "assistant", "system", "tool", "activity"];

type A2UIMiddlewareModule = typeof import("@ag-ui/a2ui-middleware");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldUseClientA2UIMiddleware(enableA2UI: boolean | undefined, url: string) {
  return Boolean(enableA2UI) && url.endsWith("/agui");
}

export type AgentMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type UseAgentOptions = {
  /** AG-UI endpoint of the ADK agent service. */
  url: string;
  /** Extra headers (e.g. Clerk identity) sent with every run. */
  headers?: Record<string, string> | (() => Promise<Record<string, string> | undefined>);
  /** Enables AG-UI A2UI tool injection/activity handling for the A2UI agent. */
  enableA2UI?: boolean;
};

// AG-UI messages are a union (text, tool calls, results). We only surface the
// human-readable text bubbles to the UI. Accepts `unknown` so the streamed
// message list can be mapped without an array-level cast.
function toAgentMessage(message: unknown): AgentMessage {
  const m = isRecord(message) ? message : {};
  const role = CHAT_ROLES.find((r) => r === m.role) ?? "assistant";
  const activityType = typeof m.activityType === "string" ? m.activityType : "agent UI";
  const content =
    typeof m.content === "string"
      ? m.content
      : role === "activity"
        ? `Rendered ${activityType}`
        : "";

  const id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;

  return {
    id: String(id ?? Math.random().toString(36).slice(2)),
    role,
    content,
  };
}

export function useAgent<TState extends Record<string, unknown>>(
  options: UseAgentOptions,
  initialState: TState,
) {
  const { url, headers, enableA2UI } = options;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [state, setState] = useState<TState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useClientA2UIMiddleware = shouldUseClientA2UIMiddleware(enableA2UI, url);

  // Stable identity for the headers object so the agent is only recreated when
  // the endpoint or auth headers actually change.
  const headerKey = JSON.stringify(headers ?? {});
  const initialStateRef = useRef(initialState);
  const a2uiMiddlewareAgentRef = useRef<HttpAgent | null>(null);

  const agent = useMemo(() => {
    const instance = new HttpAgent({
      url,
      headers: typeof headers === "function" ? undefined : headers,
    });
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
      const userAgentMessage: Message = {
        id: userMessage.id,
        role: "user",
        content,
      };
      agent.messages = [...agent.messages, userAgentMessage];

      try {
        if (useClientA2UIMiddleware && a2uiMiddlewareAgentRef.current !== agent) {
          const { A2UIMiddleware } = (await import(
            "@ag-ui/a2ui-middleware"
          )) as A2UIMiddlewareModule;
          agent.use(new A2UIMiddleware({ injectA2UITool: true }));
          a2uiMiddlewareAgentRef.current = agent;
        }
        agent.headers = typeof headers === "function" ? ((await headers()) ?? {}) : (headers ?? {});

        const subscriber: AgentSubscriber = {
          // Fires on every streamed token and message mutation.
          onMessagesChanged: ({ messages: next }) => {
            setMessages(
              next
                .map(toAgentMessage)
                .filter(
                  (m) =>
                    (m.role === "user" || m.role === "assistant" || m.role === "activity") &&
                    m.content.length > 0,
                ),
            );
          },
          // Client has already applied snapshots + JSON-patch deltas here.
          onStateChanged: ({ state: next }) => {
            if (isRecord(next)) setState((prev) => ({ ...prev, ...next }));
          },
          onRunErrorEvent: () => {
            setError("Connection error. Is the agent running?");
          },
        };

        await agent.runAgent({ runId: `run_${Date.now()}` }, subscriber);
      } catch {
        setError("Connection error. Is the agent running?");
      } finally {
        setIsLoading(false);
      }
    },
    [agent, headers, isLoading, useClientA2UIMiddleware],
  );

  return { messages, state, isLoading, error, sendMessage };
}
