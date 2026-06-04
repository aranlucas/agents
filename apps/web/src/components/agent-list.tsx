"use client";

import { AgentCard, type Agent } from "@/components/agent-card";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";

export function AgentList({ agents }: { agents: Agent[] }) {
  const { statuses } = useAgentWarmup();

  return (
    <div className="grid flex-1 gap-3">
      {agents.map((agent, index) => (
        <AgentCard key={agent.id} agent={agent} index={index} status={statuses[agent.theme]} />
      ))}
    </div>
  );
}
