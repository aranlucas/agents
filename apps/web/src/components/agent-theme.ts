import { cssVars } from "@/lib/css";

export type AgentTheme =
  | "travel"
  | "grocery"
  | "fitness"
  | "wellness"
  | "expense"
  | "oral-boards"
  | "oral-boards-v2"
  | "a2ui"
  | "resume";

export const AGENT_THEMES: Record<
  AgentTheme,
  {
    label: string;
    colorVar: string;
    softVar: string;
    contrastVar: string;
  }
> = {
  travel: {
    label: "Travel",
    colorVar: "var(--travel)",
    softVar: "var(--travel-soft)",
    contrastVar: "var(--travel-contrast)",
  },
  grocery: {
    label: "Grocery",
    colorVar: "var(--grocery)",
    softVar: "var(--grocery-soft)",
    contrastVar: "var(--grocery-contrast)",
  },
  fitness: {
    label: "Fitness",
    colorVar: "var(--fitness)",
    softVar: "var(--fitness-soft)",
    contrastVar: "var(--fitness-contrast)",
  },
  wellness: {
    label: "Wellness",
    colorVar: "var(--wellness)",
    softVar: "var(--wellness-soft)",
    contrastVar: "var(--wellness-contrast)",
  },
  expense: {
    label: "Expense Desk",
    colorVar: "var(--expense)",
    softVar: "var(--expense-soft)",
    contrastVar: "var(--expense-contrast)",
  },
  "oral-boards": {
    label: "Oral Boards",
    colorVar: "var(--oral-boards)",
    softVar: "var(--oral-boards-soft)",
    contrastVar: "var(--oral-boards-contrast)",
  },
  "oral-boards-v2": {
    label: "Oral Boards v2",
    colorVar: "var(--oral-boards)",
    softVar: "var(--oral-boards-soft)",
    contrastVar: "var(--oral-boards-contrast)",
  },
  a2ui: {
    label: "A2UI",
    colorVar: "var(--a2ui)",
    softVar: "var(--a2ui-soft)",
    contrastVar: "var(--a2ui-contrast)",
  },
  resume: {
    label: "Resume",
    colorVar: "var(--resume)",
    softVar: "var(--resume-soft)",
    contrastVar: "var(--resume-contrast)",
  },
};

export function agentStyle(theme: AgentTheme) {
  const t = AGENT_THEMES[theme];
  return cssVars({
    "--agent-color": t.colorVar,
    "--agent-soft": t.softVar,
    "--agent-contrast": t.contrastVar,
  });
}
