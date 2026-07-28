"use client";

import { NativeSelect, NativeSelectOption } from "@agents/ui/components/native-select";
import { cn } from "@agents/ui/lib/utils";
import { AgentIcon } from "@/components/agent-icon";
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
    <div className="flex items-center gap-2">
      <AgentIcon agentId={active} className={cn("size-3.5", cfg.colorClass)} />
      <NativeSelect
        aria-label="Active agent"
        className="max-w-44"
        size="sm"
        value={active}
        onChange={(e) => {
          if (isAgentId(e.target.value)) onSelect(e.target.value);
        }}
      >
        {AGENT_ORDER.map((id) => (
          <NativeSelectOption key={id} value={id}>
            {getAgentConfig(id).label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
