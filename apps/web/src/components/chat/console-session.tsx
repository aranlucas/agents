"use client";

import { useAuth } from "@clerk/nextjs";
import { CopilotKit, type CopilotKitProps } from "@copilotkit/react-core/v2";
import * as Sentry from "@sentry/nextjs";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";

import type { AgentId } from "@/components/chat/agents/registry";
import { ConsoleThreadsProvider } from "@/components/chat/console-threads";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

type ConsoleSessionProps = {
  agent: AgentId;
  thread?: string;
  children: ReactNode;
  loading?: ReactNode;
};

const AGENTS_BASE_URL = agentBaseUrl(env.NEXT_PUBLIC_AGENTS_BASE_URL);

type CopilotKitErrorEvent = Parameters<NonNullable<CopilotKitProps["onError"]>>[0];

export function reportCopilotKitError(event: CopilotKitErrorEvent) {
  const error: unknown = event.error;
  if (error instanceof Error && error.name === "AbortError") return;

  const reportableError = error instanceof Error ? error : new Error(String(error));
  const source = typeof event.context.source === "string" ? event.context.source : "unknown";
  const extra: Record<string, string | number | boolean> = {};
  for (const key of ["threadId", "runId"] as const) {
    const value: unknown = event.context[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      extra[key] = value;
    }
  }
  Sentry.captureException(reportableError, {
    tags: {
      component: "copilotkit",
      "copilotkit.event_type": event.type,
      "copilotkit.source": source,
      "agent.name": event.context.agent?.name ?? "unknown",
    },
    extra,
  });
  // Explicitly captured above with sanitized metadata. Avoid console.error here:
  // CaptureConsole would create a duplicate and attach the full CopilotKit context.
  console.warn("[CopilotKit] Error:", error);
}

function GatewayConsoleSession({ agent: agentId, thread, children, loading }: ConsoleSessionProps) {
  const { getToken, isLoaded, sessionId } = useAuth();

  // CopilotKit applies these headers to runtime discovery, run, connect, stop,
  // and stateless suggestion requests. The gateway verifies and forwards the
  // Clerk identity before dispatching to the selected ADK agent.
  const { data: token, isPending: isTokenPending } = useQuery({
    queryKey: ["clerk-agent-token", sessionId, agentId, thread],
    queryFn: async () => (await getToken()) ?? null,
    enabled: isLoaded,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const agentHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  if (!isLoaded || isTokenPending) {
    return (
      loading ?? (
        <div className="min-h-0 flex-1" aria-busy="true" aria-label="Loading conversation" />
      )
    );
  }

  return (
    <CopilotKit
      key={`${agentId}:${thread ?? ""}`}
      agent={agentId}
      runtimeUrl={AGENTS_BASE_URL}
      headers={agentHeaders}
      useSingleEndpoint={false}
      threadId={thread}
      enableInspector={false}
      onError={reportCopilotKitError}
    >
      <ConsoleThreadsProvider agentId={agentId} enabled={Boolean(token)}>
        {children}
      </ConsoleThreadsProvider>
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
 * Production sessions connect to the CopilotKit-compatible runtime hosted by
 * the Railway Go gateway. Long-lived SSE runs stay out of Vercel while agents
 * are discovered through the standard runtime /info contract.
 */
export function ConsoleSession(props: ConsoleSessionProps) {
  return <GatewayConsoleSession {...props} />;
}
