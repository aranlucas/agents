"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { missingProviders, type ExternalAccountLike, type ProviderId } from "@/lib/connections";

const isOfflineAgentTestMode = process.env.NEXT_PUBLIC_AGENT_TEST_MODE === "offline";

/**
 * Reads the agent's `requires` list and reports which of those providers the
 * signed-in user has NOT linked. Clerk's client-side user can remain stale
 * after linking an account in UserProfile, so refresh it once before deciding
 * that a required connection is missing.
 */
export function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  missing: ProviderId[];
} {
  const required = getAgentConfig(agentId).requires ?? [];
  const { isLoaded, user } = useUser();
  const refreshKey =
    isLoaded && user && required.length > 0 ? `${user.id}:${required.join(",")}` : null;
  const startedRefreshKey = useRef<string | null>(null);
  const [completedRefreshKey, setCompletedRefreshKey] = useState<string | null>(null);

  useEffect(() => {
    if (!refreshKey || !user || startedRefreshKey.current === refreshKey) return;

    startedRefreshKey.current = refreshKey;
    void user
      .reload()
      .catch(() => undefined)
      .finally(() => {
        setCompletedRefreshKey(refreshKey);
      });
  }, [refreshKey, user]);

  if (isOfflineAgentTestMode) {
    return { isLoading: false, missing: [] };
  }

  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];

  return {
    isLoading:
      !isLoaded ||
      (required.length > 0 && !user) ||
      (refreshKey !== null && completedRefreshKey !== refreshKey),
    missing: missingProviders(required, accounts),
  };
}
