"use client";

import { useQuery } from "@tanstack/react-query";

export type AgentStatus = "loading" | "ok" | "error";

interface AgentStatuses {
  travel: AgentStatus;
  grocery: AgentStatus;
  fitness: AgentStatus;
  wellness: AgentStatus;
  expense: AgentStatus;
  "oral-boards": AgentStatus;
  trends: AgentStatus;
  resume: AgentStatus;
  research: AgentStatus;
  spreadsheet: AgentStatus;
  presentation: AgentStatus;
}

interface HealthResponse {
  agents: AgentStatuses;
  runningCount: number;
  total: number;
}

const FALLBACK: AgentStatuses = {
  travel: "loading",
  grocery: "loading",
  fitness: "loading",
  wellness: "loading",
  expense: "loading",
  "oral-boards": "loading",
  trends: "loading",
  resume: "loading",
  research: "loading",
  spreadsheet: "loading",
  presentation: "loading",
};

export function useAgentWarmup() {
  const { data, isLoading } = useQuery<HealthResponse>({
    queryKey: ["agents-health"],
    queryFn: () => fetch("/api/agents/health").then((r) => r.json()),
    staleTime: 30_000,
    retry: 2,
    // The health endpoint intentionally returns 200 with per-agent error
    // statuses, so React Query's transport retry does not cover a gateway
    // that is still starting. Poll only while something is unready and stop
    // as soon as the whole registry reports healthy.
    refetchInterval: (query) =>
      Object.values(query.state.data?.agents ?? FALLBACK).some((status) => status !== "ok")
        ? 2_000
        : false,
  });

  return {
    statuses: data?.agents ?? FALLBACK,
    runningCount: data?.runningCount ?? 0,
    total: data?.total ?? Object.keys(FALLBACK).length,
    isLoading,
  };
}
