"use client";

import { useUser } from "@clerk/nextjs";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { missingProviders, type ExternalAccountLike, type ProviderId } from "@/lib/connections";

const isOfflineAgentTestMode = process.env.NEXT_PUBLIC_AGENT_TEST_MODE === "offline";

/**
 * Reads the agent's `requires` list and reports which of those providers the
 * signed-in user has NOT linked, sourced from Clerk's client-side
 * `externalAccounts` (no network request).
 */
export function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  missing: ProviderId[];
} {
  const required = getAgentConfig(agentId).requires ?? [];
  if (isOfflineAgentTestMode) {
    return { isLoading: false, missing: [] };
  }

  const { isLoaded, user } = useUser();
  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];

  return {
    isLoading: !isLoaded,
    missing: missingProviders(required, accounts),
  };
}
