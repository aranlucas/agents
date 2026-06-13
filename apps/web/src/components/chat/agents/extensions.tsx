"use client";

import type { ComponentProps, ComponentType } from "react";
import type { CopilotKit } from "@copilotkit/react-core/v2";

import { GroceryHooks, TravelHooks } from "./approval";
import { OralBoardsExtension } from "./oral-boards";
import type { AgentId } from "./registry";

/**
 * Per-agent console customizations, keyed by agent id. This is the single place
 * an agent's console route (`/console/<agent>`) reaches for agent-specific
 * wiring, so adding a new agent's frontend tools, human-in-the-loop handlers,
 * or resource preloads never means editing `ConsoleSession`/`AgentWorkspace`
 * (or `ChatSurface`) with another `id === …` branch.
 *
 * - `copilotKitProps` is merged into the route's `<CopilotKit>` provider — e.g.
 *   a2ui advertises its auto-mounted activity renderer this way.
 * - `Mount` is a headless client component rendered inside `<CopilotKit>` that
 *   registers tools/handlers or kicks off preloads on entry.
 */
export type AgentExtension = {
  copilotKitProps?: Partial<ComponentProps<typeof CopilotKit>>;
  Mount?: ComponentType<{ agentId: AgentId }>;
};

// Enables the auto-mounted A2UI activity renderer (the runtime advertises A2UI
// via /info for the a2ui agent). Hoisted so the prop identity stays stable.
const A2UI_CONFIG = {};

const AGENT_EXTENSIONS: Partial<Record<AgentId, AgentExtension>> = {
  travel: { Mount: TravelHooks },
  grocery: { Mount: GroceryHooks },
  "oral-boards": { Mount: OralBoardsExtension },
  a2ui: { copilotKitProps: { a2ui: A2UI_CONFIG } },
};

export function getAgentExtension(agentId: AgentId): AgentExtension | undefined {
  return AGENT_EXTENSIONS[agentId];
}

/**
 * Renders the active agent's headless `Mount` component (if any) inside the
 * console's `<CopilotKit>` provider. Returns null for agents without extra
 * wiring.
 */
export function AgentExtensionSlot({ agentId }: { agentId: AgentId }) {
  const Mount = AGENT_EXTENSIONS[agentId]?.Mount;
  return Mount ? <Mount agentId={agentId} /> : null;
}
