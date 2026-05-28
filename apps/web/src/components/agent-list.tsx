"use client";

import { AgentCard, type Agent } from "@/components/agent-card";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";

export function AgentList({ agents }: { agents: Agent[] }) {
  const { statuses } = useAgentWarmup();

  return (
    <div className="flex-1 divide-y divide-[var(--border)]">
      {agents.map((agent, index) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          index={index}
          status={statuses[agent.theme]}
        />
      ))}
    </div>
  );
}
