"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { AgentId } from "@/components/chat/agents/registry";

/**
 * Returns a "start a new thread" callback for the given agent: aborts any
 * in-flight run, then routes to a fresh thread id (the URL is the source of
 * truth for the active thread, so a new id starts a clean CopilotKit/ADK
 * session and the result is refreshable and shareable).
 */
export function useNewThread(agentId: AgentId) {
  const router = useRouter();
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });
  return useCallback(() => {
    if (agent?.isRunning) agent.abortRun();
    router.push(`/console/${agentId}/${crypto.randomUUID()}`);
  }, [agent, agentId, router]);
}
