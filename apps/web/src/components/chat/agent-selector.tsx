"use client";

import { Label } from "@agents/ui";
import { cn } from "@agents/ui/lib/utils";
import { AGENT_ORDER, getAgentConfig, isAgentId, type AgentId } from "./agents/registry";

export function AgentSelector({
  active,
  onSelect,
}: {
  active: AgentId;
  onSelect: (id: AgentId) => void;
}) {
  const cfg = getAgentConfig(active);
  return (
    <Label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 font-mono text-xs text-ink-soft">
      <span className={cn(cfg.colorClass)}>{cfg.glyph}</span>
      <select
        aria-label="Active agent"
        value={active}
        onChange={(e) => {
          if (isAgentId(e.target.value)) onSelect(e.target.value);
        }}
        className="cursor-pointer bg-transparent outline-none"
      >
        {AGENT_ORDER.map((id) => (
          <option key={id} value={id}>
            {getAgentConfig(id).label}
          </option>
        ))}
      </select>
    </Label>
  );
}
