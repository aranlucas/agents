"use client";

import { useAgentWarmup } from "@/hooks/use-agent-warmup";

const ENTRIES = [
  { color: "#ea580c", label: "Travel", key: "travel" },
  { color: "#16a34a", label: "Grocery", key: "grocery" },
  { color: "#0284c7", label: "Fitness", key: "fitness" },
  { color: "#d97706", label: "Wellness", key: "wellness" },
] as const;

export function AgentKey() {
  const { statuses } = useAgentWarmup();

  return (
    <div className="hidden md:flex flex-col items-end gap-2 pb-1 shrink-0">
      {ENTRIES.map(({ color, label, key }) => {
        const s = statuses[key];
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--ink-mute)]">
              {label}
            </span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                s === "loading"
                  ? "opacity-30 animate-pulse"
                  : s === "error"
                    ? "opacity-50"
                    : ""
              }`}
              style={{ backgroundColor: s === "error" ? "#ef4444" : color }}
            />
          </div>
        );
      })}
    </div>
  );
}
