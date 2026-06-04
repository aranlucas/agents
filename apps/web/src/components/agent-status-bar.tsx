"use client";

import { useAgentWarmup } from "@/hooks/use-agent-warmup";

export function AgentStatusBar() {
  const { runningCount, isLoading } = useAgentWarmup();

  const dotClass = isLoading
    ? "bg-[var(--ink-mute)] animate-pulse"
    : runningCount === 4
      ? "bg-[var(--success)] animate-pulse"
      : runningCount === 0
        ? "bg-[var(--danger)]"
        : "bg-[var(--warning)] animate-pulse";

  const label = isLoading ? "checking agents…" : `${runningCount} / 4 running · CopilotKit × ADK`;

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="font-mono text-[10px] text-[var(--ink-soft)]">{label}</span>
    </div>
  );
}
