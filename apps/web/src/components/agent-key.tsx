"use client";

import { AGENT_THEMES, type AgentTheme } from "@/components/agent-theme";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";

const ENTRIES: AgentTheme[] = ["travel", "grocery", "fitness", "wellness"];

export function AgentKey() {
  const { statuses } = useAgentWarmup();

  return (
    <div className="hidden shrink-0 flex-col items-end gap-2 pb-1 md:flex">
      {ENTRIES.map((key) => {
        const s = statuses[key];
        const theme = AGENT_THEMES[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--ink-mute)]">{theme.label}</span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                s === "loading" ? "animate-pulse opacity-30" : s === "error" ? "opacity-50" : ""
              }`}
              style={{ backgroundColor: s === "error" ? "var(--danger)" : theme.colorVar }}
            />
          </div>
        );
      })}
    </div>
  );
}
