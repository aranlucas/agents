"use client";

import { useAuth } from "@clerk/nextjs";
import { HttpAgent } from "@ag-ui/client";
import { CopilotKit, type CopilotKitProps } from "@copilotkit/react-core/v2";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo } from "react";

import { AGENT_BACKEND_PATHS, AGENT_ORDER, type AgentId } from "@/components/chat/agents/registry";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

type ConsoleSessionProps = {
  agent: AgentId;
  thread?: string;
  children: ReactNode;
};

const AGENTS_BASE_URL = agentBaseUrl(env.NEXT_PUBLIC_AGENTS_BASE_URL);

type CopilotKitErrorEvent = Parameters<NonNullable<CopilotKitProps["onError"]>>[0];

type DirectAgentMap = Record<string, HttpAgent>;

type BuildSelfManagedAgentsArgs = {
  baseUrl: string;
  headers: Record<string, string>;
  fetchAgent: (url: string, init?: RequestInit) => Promise<Response>;
};

function buildAgents({ baseUrl, headers, fetchAgent }: BuildSelfManagedAgentsArgs): DirectAgentMap {
  const agents: DirectAgentMap = {};

  for (const id of AGENT_ORDER) {
    agents[id] = new HttpAgent({
      agentId: id,
      url: `${baseUrl}/${AGENT_BACKEND_PATHS[id]}/agui`,
      headers,
      fetch: fetchAgent,
      debug: process.env.NODE_ENV !== "production",
    });
  }

  return agents;
}

export function reportCopilotKitError(event: CopilotKitErrorEvent) {
  const error: unknown = event.error;
  if (error instanceof Error && error.name === "AbortError") return;

  console.error("[CopilotKit] Error:", error, event.context);
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

  const authenticatedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const currentToken = await getToken();

      if (currentToken) {
        headers.set("Authorization", `Bearer ${currentToken}`);
      } else {
        headers.delete("Authorization");
      }

      return fetch(url, { ...init, headers });
    },
    [getToken],
  );

  const agents__unsafe_dev_only = useMemo(
    () =>
      buildAgents({
        baseUrl: AGENTS_BASE_URL,
        headers: agentHeaders,
        fetchAgent: authenticatedFetch,
      }),
    [agentHeaders, authenticatedFetch],
  );

  if (!isLoaded || isTokenPending) {
    return <div className="min-h-0 flex-1" aria-busy="true" aria-label="Loading conversation" />;
  }

  return (
    <CopilotKit
      agents__unsafe_dev_only={agents__unsafe_dev_only}
      agent={agentId}
      threadId={thread}
      enableInspector={process.env.NODE_ENV !== "production"}
      onError={reportCopilotKitError}
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
  return <DirectConsoleSession {...props} />;
}
