"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { AGENT_BACKEND_PATHS, type AgentId } from "@/components/chat/agents/registry";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

const agentSessionSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  lastUpdateTime: z.number().finite(),
});

const agentSessionsSchema = z.array(agentSessionSummarySchema);

export type AgentSessionSummary = z.infer<typeof agentSessionSummarySchema>;

async function fetchAgentSessions(
  agentId: AgentId,
  getToken: () => Promise<string | null>,
  signal: AbortSignal,
): Promise<AgentSessionSummary[]> {
  const token = await getToken();
  if (!token) throw new Error("A signed-in session is required to load conversation history.");

  const route = AGENT_BACKEND_PATHS[agentId];
  const response = await fetch(
    `${agentBaseUrl(env.NEXT_PUBLIC_AGENTS_BASE_URL)}/${route}/agents/sessions`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error(`Conversation history request failed (${response.status}).`);

  return agentSessionsSchema.parse(await response.json());
}

export function useAgentSessions(agentId: AgentId) {
  const { getToken, isLoaded, userId } = useAuth();
  const query = useQuery({
    queryKey: ["agent-sessions", agentId, userId],
    queryFn: ({ signal }) => fetchAgentSessions(agentId, getToken, signal),
    enabled: isLoaded && Boolean(userId),
    staleTime: 10_000,
  });
  return { ...query, isAuthenticated: Boolean(userId) };
}
