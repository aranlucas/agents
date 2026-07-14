"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { hasKrogerConnection, type ExternalAccountLike } from "@/lib/connections";

/**
 * Reports whether the agent's required Kroger account is missing. Clerk's client-side user can remain stale
 * after linking an account in UserProfile, so refresh it once before deciding
 * that a required connection is missing.
 */
export function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  isMissing: boolean;
} {
  const requiresKroger = getAgentConfig(agentId).requiresKroger === true;
  const { isLoaded, user } = useUser();
  const refreshKey = isLoaded && user && requiresKroger ? user.id : null;
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

  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];

  return {
    isLoading:
      !isLoaded ||
      (requiresKroger && !user) ||
      (refreshKey !== null && completedRefreshKey !== refreshKey),
    isMissing: requiresKroger && !hasKrogerConnection(accounts),
  };
}
