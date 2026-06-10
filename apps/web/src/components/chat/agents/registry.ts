import type { ArtifactKind } from "@agents/types";

import type { ProviderId } from "@/lib/connections";

export type AgentId = "travel" | "grocery" | "fitness" | "wellness" | "a2ui";

export type ArtifactSource = {
  /** Agent-state field holding the live document content (string or string[]). */
  stateField: string;
  kind: ArtifactKind;
  title: string;
  /** Artifact filename used in Milestone 2 (kept here so the registry is the single source). */
  name: string;
};

export type AgentConfig = {
  id: AgentId;
  label: string;
  glyph: string;
  /** CSS custom property holding the agent accent, e.g. "--travel". */
  colorVar: string;
  placeholder: string;
  welcome?: string;
  artifact?: ArtifactSource;
  /** External OAuth providers that must be connected before this agent is usable. */
  requires?: ProviderId[];
};

export const AGENTS: Record<AgentId, AgentConfig> = {
  travel: {
    id: "travel",
    label: "Trip Studio",
    glyph: "✈",
    colorVar: "--travel",
    placeholder: "Plan a trip, rework a day, or ask for tradeoffs…",
    welcome: "Tell me where you want to go, your dates, and the kind of trip you want.",
    artifact: {
      stateField: "itinerary",
      kind: "markdown",
      title: "Itinerary",
      name: "itinerary.md",
    },
  },
  grocery: {
    id: "grocery",
    requires: ["kroger"],
    label: "Grocery",
    glyph: "🛒",
    colorVar: "--grocery",
    placeholder: "Plan meals, build a list, or find deals…",
    artifact: {
      stateField: "shopping_list",
      kind: "list",
      title: "Shopping list",
      name: "shopping_list.json",
    },
  },
  fitness: {
    id: "fitness",
    requires: ["strava"],
    label: "Fitness",
    glyph: "💪",
    colorVar: "--fitness",
    placeholder: "Plan training, log a workout, or set a goal…",
    artifact: {
      stateField: "weekly_plan",
      kind: "plan",
      title: "Training plan",
      name: "training_plan.md",
    },
  },
  wellness: {
    id: "wellness",
    requires: ["kroger", "strava"],
    label: "Wellness",
    glyph: "☯",
    colorVar: "--wellness",
    placeholder: "Coordinate a week of meals and training…",
    artifact: {
      stateField: "weekly_plan",
      kind: "plan",
      title: "Wellness plan",
      name: "wellness_plan.md",
    },
  },
  a2ui: {
    id: "a2ui",
    label: "A2UI",
    glyph: "▦",
    colorVar: "--a2ui",
    placeholder: "Ask me to render an interface…",
  },
};

export const AGENT_ORDER: AgentId[] = ["travel", "grocery", "fitness", "wellness", "a2ui"];

export function isAgentId(value: string): value is AgentId {
  return value in AGENTS;
}

export function getAgentConfig(id: AgentId): AgentConfig;
export function getAgentConfig(id: string): AgentConfig | undefined;
export function getAgentConfig(id: string): AgentConfig | undefined {
  return isAgentId(id) ? AGENTS[id] : undefined;
}
