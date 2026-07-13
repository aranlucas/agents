"use client";

import { useAuth } from "@clerk/nextjs";
import { HttpAgent } from "@ag-ui/client";
import { CopilotKit } from "@copilotkit/react-core/v2";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo } from "react";

import { AGENT_BACKEND_PATHS, type AgentId } from "@/components/chat/agents/registry";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

const isOfflineAgentTestMode = process.env.NEXT_PUBLIC_AGENT_TEST_MODE === "offline";

type ConsoleSessionProps = {
  agent: AgentId;
  thread: string;
  children: ReactNode;
};

function OfflineConsoleSession({ agent, thread, children }: ConsoleSessionProps) {
  return (
    <CopilotKit
      runtimeUrl="/api/offline-copilotkit"
      agent={agent}
      threadId={thread}
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      {children}
    </CopilotKit>
  );
}

function DirectConsoleSession({ agent: agentId, thread, children }: ConsoleSessionProps) {
  const { getToken, isLoaded, sessionId } = useAuth();

  // Seed HttpAgent's native headers once per Clerk session. The fetch override
  // below still gets a current token before every request.
  const { data: token, isPending: isTokenPending } = useQuery({
    queryKey: ["clerk-agent-token", sessionId],
    queryFn: () => getToken(),
    enabled: isLoaded,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const agentHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const endpoint = useMemo(
    () => `${agentBaseUrl(env.NEXT_PUBLIC_AGENTS_BASE_URL)}/${AGENT_BACKEND_PATHS[agentId]}`,
    [agentId],
  );

  const authenticatedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const token = await getToken();

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      } else if (agentId !== "resume") {
        throw new Error("A signed-in session is required to connect to this agent.");
      } else {
        headers.delete("Authorization");
      }

      return fetch(url, { ...init, headers });
    },
    [agentId, getToken],
  );

  const directAgent = useMemo(
    () =>
      new HttpAgent({
        agentId,
        threadId: thread,
        url: `${endpoint}/agui`,
        headers: agentHeaders,
        fetch: authenticatedFetch,
        debug: process.env.NODE_ENV !== "production",
      }),
    [agentHeaders, agentId, authenticatedFetch, endpoint, thread],
  );

  const selfManagedAgents = useMemo(() => ({ [agentId]: directAgent }), [agentId, directAgent]);

  if (!isLoaded || isTokenPending) {
    return <div className="min-h-0 flex-1" aria-busy="true" aria-label="Loading conversation" />;
  }

  return (
    <CopilotKit
      selfManagedAgents={selfManagedAgents}
      agent={agentId}
      threadId={thread}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      {children}
    </CopilotKit>
  );
}

/**
 * The console session provider, shared by every agent's `[thread]/layout.tsx`.
 * It owns the `<CopilotKit>` provider keyed to the agent + the URL's thread id,
 * so the provider persists across in-thread navigation while the page renders
 * the view. The thread id is the durable session key that CopilotKit forwards
 * to the gateway's persisted ADK session.
 *
 * Production sessions connect the browser straight to the Railway AG-UI
 * endpoint. This keeps long-lived SSE runs out of Vercel's request-duration
 * path. Offline fixture tests use a separate deterministic transport.
 */
export function ConsoleSession(props: ConsoleSessionProps) {
  return isOfflineAgentTestMode ? (
    <OfflineConsoleSession {...props} />
  ) : (
    <DirectConsoleSession {...props} />
  );
}
