"use client";

import { useQuery } from "@tanstack/react-query";

export type AgentStatus = "loading" | "ok" | "error";

export interface AgentStatuses {
  travel: AgentStatus;
  grocery: AgentStatus;
  fitness: AgentStatus;
  wellness: AgentStatus;
  expense: AgentStatus;
  "oral-boards": AgentStatus;
  "oral-boards-v2": AgentStatus;
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
  "oral-boards-v2": "loading",
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
  });

  return {
    statuses: data?.agents ?? FALLBACK,
    runningCount: data?.runningCount ?? 0,
    total: data?.total ?? Object.keys(FALLBACK).length,
    isLoading,
  };
}
