"use client";

import { useAgentWarmup } from "@/hooks/use-agent-warmup";

export function AgentStatusBar() {
  const { runningCount, total, isLoading } = useAgentWarmup();

  const dotClass = isLoading
    ? "bg-muted-foreground animate-pulse"
    : runningCount === total
      ? "bg-(--success) animate-pulse"
      : runningCount === 0
        ? "bg-destructive"
        : "bg-(--warning) animate-pulse";

  const label = isLoading
    ? "checking agents…"
    : `${runningCount} / ${total} running · CopilotKit × ADK`;

  return (
    <div className="border-border flex items-center gap-2.5 rounded-full border bg-(--surface-raised) px-2.5 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="font-mono text-[10px] text-(--ink-soft)">{label}</span>
    </div>
  );
}
