export * from "./generated/agent-contracts";

import type { OralBoardsSkill } from "./generated/agent-contracts";

// UI-only contracts stay authored here. Agent identity and client-visible
// backend state are generated from Go by `pnpm --filter agents contracts:generate`.

// Artifact kinds rendered by the shared console artifact panel.
export type ArtifactKind = "markdown" | "document" | "list" | "code" | "plan";

// Display metadata for the three blueprint skill levels. The values are UI
// copy; the OralBoardsSkill union itself is generated from the Go constants.
export const OCE_SKILL_LEVELS: Record<OralBoardsSkill, { label: string; description: string }> = {
  remember: {
    label: "Remember",
    description: "Recall facts, terms, and basic concepts.",
  },
  understand_apply: {
    label: "Understand / Apply",
    description: "Explain concepts and apply knowledge to the clinical situation.",
  },
  analyze_evaluate: {
    label: "Analyze / Evaluate",
    description: "Analyze, compare, and evaluate to reach and defend a decision.",
  },
};
