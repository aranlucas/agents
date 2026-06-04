"use client";

import { useAgentWarmup } from "@/hooks/use-agent-warmup";

export function AgentStatusBar() {
  const { runningCount, isLoading } = useAgentWarmup();

  const dotClass = isLoading
    ? "bg-[var(--ink-mute)] animate-pulse"
    : runningCount === 4
      ? "bg-[var(--success)] animate-pulse"
      : runningCount === 0
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const label = isLoading ? "checking agents…" : `${runningCount} / 4 running · CopilotKit × ADK`;

  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="font-mono text-[10px] text-[var(--ink-mute)]">{label}</span>
    </div>
  );
}
