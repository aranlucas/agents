"use client";

import { useUser } from "@clerk/nextjs";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { missingProviders, type ExternalAccountLike, type ProviderId } from "@/lib/connections";

/**
 * Reads the agent's `requires` list and reports which of those providers the
 * signed-in user has NOT linked, sourced from Clerk's client-side
 * `externalAccounts` (no network request).
 */
export function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  missing: ProviderId[];
} {
  const { isLoaded, user } = useUser();
  const required = getAgentConfig(agentId).requires ?? [];
  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];

  return {
    isLoading: !isLoaded,
    missing: missingProviders(required, accounts),
  };
}
