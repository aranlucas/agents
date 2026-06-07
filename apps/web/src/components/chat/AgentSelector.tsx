"use client";

import { AGENT_ORDER, getAgentConfig, type AgentId } from "./agents/registry";

export function AgentSelector({
  active,
  onSelect,
}: {
  active: AgentId;
  onSelect: (id: AgentId) => void;
}) {
  const cfg = getAgentConfig(active);
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-soft)]">
      <span style={{ color: `var(${cfg.colorVar})` }}>{cfg.glyph}</span>
      <select
        aria-label="Active agent"
        value={active}
        onChange={(e) => onSelect(e.target.value as AgentId)}
        className="cursor-pointer bg-transparent outline-none"
      >
        {AGENT_ORDER.map((id) => (
          <option key={id} value={id}>
            {getAgentConfig(id).label}
          </option>
        ))}
      </select>
    </label>
  );
}
