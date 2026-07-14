"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";

import type { ArtifactView } from "../artifact";
import type { AgentId } from "./registry";

/**
 * Per-agent console customizations, keyed by agent id. This is the single place
 * an agent's console route (`/console/<agent>`) reaches for agent-specific
 * wiring, so adding a new agent's frontend tools, human-in-the-loop handlers,
 * or resource preloads never means editing `ConsoleSession`/`AgentWorkspace`
 * (or `ChatSurface`) with another `id === …` branch.
 *
 * - `Mount` is a headless client component rendered inside `<CopilotKit>` that
 *   registers tools/handlers or kicks off preloads on entry.
 */
export type AgentArtifactProps = {
  state: unknown;
  view: ArtifactView;
  onClose: () => void;
};

export type AgentExtension = {
  Mount?: ComponentType<{ agentId: AgentId }>;
  Artifact?: ComponentType<AgentArtifactProps>;
};

const OralBoardsExtension = dynamic(
  () => import("./oral-boards").then((mod) => mod.OralBoardsExtension),
  { ssr: false },
);

const ResumeArtifact = dynamic(() => import("./resume").then((mod) => mod.ResumeArtifact), {
  ssr: false,
});

const ResumeExtension = dynamic(() => import("./resume").then((mod) => mod.ResumeExtension), {
  ssr: false,
});

const TrendsArtifact = dynamic(() => import("./trends").then((mod) => mod.TrendsArtifact), {
  ssr: false,
});

const AGENT_EXTENSIONS: Partial<Record<AgentId, AgentExtension>> = {
  "oral-boards": { Mount: OralBoardsExtension },
  resume: { Mount: ResumeExtension, Artifact: ResumeArtifact },
  trends: { Artifact: TrendsArtifact },
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
