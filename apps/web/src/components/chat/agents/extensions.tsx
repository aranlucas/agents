"use client";

import type { ComponentProps, ComponentType } from "react";
import type { CopilotKit } from "@copilotkit/react-core/v2";
import dynamic from "next/dynamic";

import { GroceryHooks, TravelHooks } from "./approval";
import { trendsCatalog } from "./trends/catalog";
import type { AgentId } from "./registry";

/**
 * Per-agent console customizations, keyed by agent id. This is the single place
 * an agent's console route (`/console/<agent>`) reaches for agent-specific
 * wiring, so adding a new agent's frontend tools, human-in-the-loop handlers,
 * or resource preloads never means editing `ConsoleSession`/`AgentWorkspace`
 * (or `ChatSurface`) with another `id === …` branch.
 *
 * - `copilotKitProps` is merged into the route's `<CopilotKit>` provider — e.g.
 *   Trends advertises its custom A2UI catalog and auto-mounted activity
 *   renderer this way.
 * - `Mount` is a headless client component rendered inside `<CopilotKit>` that
 *   registers tools/handlers or kicks off preloads on entry.
 */
export type AgentExtension = {
  copilotKitProps?: Partial<ComponentProps<typeof CopilotKit>>;
  Mount?: ComponentType<{ agentId: AgentId }>;
};

// The runtime advertises A2UI via /info for the Trends agent only. The provider
// config ships Trends' domain-specific catalog (TrendMetric, TrendBarChart,
// TrendLineChart, TrendTable, SqlDisclosure) alongside the auto-mounted activity
// renderer. Recovery is left to the built-in resurface behaviour.
const TRENDS_A2UI_CONFIG = {
  catalog: trendsCatalog,
  includeSchema: true,
  recovery: {
    showAfterMs: 2000,
    showAfterAttempts: 2,
    debugExposure: "collapsed" as const,
  },
};

const OralBoardsExtension = dynamic(
  () => import("./oral-boards").then((mod) => mod.OralBoardsExtension),
  { ssr: false },
);

const AGENT_EXTENSIONS: Partial<Record<AgentId, AgentExtension>> = {
  travel: { Mount: TravelHooks },
  grocery: { Mount: GroceryHooks },
  "oral-boards": { Mount: OralBoardsExtension },
  trends: { copilotKitProps: { a2ui: TRENDS_A2UI_CONFIG } },
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
  return Mount ? <Mount key={agentId} agentId={agentId} /> : null;
}
