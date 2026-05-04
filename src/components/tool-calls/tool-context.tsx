"use client";

import { useAgentContext, type JsonSerializable } from "@copilotkit/react-core/v2";

export function ReviewingToolContext({
  toolName,
  label,
  args,
}: {
  toolName: string;
  label: string;
  args: unknown;
}) {
  useAgentContext({
    description: `User is currently reviewing the "${label}" tool result on screen.`,
    value: { tool: toolName, args } as unknown as JsonSerializable,
  });
  return null;
}

export function SelectedItemContext({
  toolName,
  label,
  item,
}: {
  toolName: string;
  label: string;
  item: unknown;
}) {
  useAgentContext({
    description: `User has selected an item from "${label}"; treat this as the focal candidate when answering follow-ups.`,
    value: { tool: toolName, selection: item } as unknown as JsonSerializable,
  });
  return null;
}
