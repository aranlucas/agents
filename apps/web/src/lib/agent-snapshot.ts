import type { AgentId } from "@/components/chat/agents/registry";
import type { AguiMessage } from "@/components/chat/messages";
import { agentBaseUrl } from "@/lib/agent-url";

export type AgentSnapshot = {
  threadId: string;
  threadExists: boolean;
  state: Record<string, unknown>;
  messages: AguiMessage[];
};

type FetchAgentSnapshotOptions = {
  baseUrl: string;
  agentId: AgentId;
  threadId: string;
  token: string | null;
  signal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is AguiMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    (value.content === undefined ||
      typeof value.content === "string" ||
      Array.isArray(value.content))
  );
}

export function parseAgentSnapshot(value: unknown, threadId: string): AgentSnapshot | null {
  if (
    !isRecord(value) ||
    value.threadId !== threadId ||
    typeof value.threadExists !== "boolean" ||
    !isRecord(value.state) ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isMessage)
  ) {
    return null;
  }

  return {
    threadId,
    threadExists: value.threadExists,
    state: value.state,
    messages: value.messages,
  };
}

export async function fetchAgentSnapshot({
  baseUrl,
  agentId,
  threadId,
  token,
  signal,
}: FetchAgentSnapshotOptions): Promise<AgentSnapshot | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${agentBaseUrl(baseUrl)}/${agentId}/agents/state`, {
      method: "POST",
      headers,
      body: JSON.stringify({ threadId }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;

    return parseAgentSnapshot(await response.json(), threadId);
  } catch {
    // Snapshot loading is an optimization. CopilotKit's normal replay remains
    // the source of truth when the gateway is unavailable or the request times out.
    return null;
  }
}
