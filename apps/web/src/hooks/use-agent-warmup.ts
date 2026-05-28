"use client";

import { useEffect, useState } from "react";

export type AgentStatus = "loading" | "ok" | "error";

export interface AgentStatuses {
  travel: AgentStatus;
  grocery: AgentStatus;
  fitness: AgentStatus;
  wellness: AgentStatus;
}

interface WarmupResult {
  statuses: AgentStatuses;
  runningCount: number;
  isLoading: boolean;
}

const INITIAL: AgentStatuses = {
  travel: "loading",
  grocery: "loading",
  fitness: "loading",
  wellness: "loading",
};

export function useAgentWarmup(): WarmupResult {
  const [statuses, setStatuses] = useState<AgentStatuses>(INITIAL);
  const [runningCount, setRunningCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function warmup() {
      try {
        const res = await fetch("/api/agents/health", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setStatuses(data.agents);
          setRunningCount(data.runningCount);
        }
      } catch {
        // leave statuses as "loading" — agents may not be reachable
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    warmup();
    return () => { cancelled = true; };
  }, []);

  return { statuses, runningCount, isLoading };
}
