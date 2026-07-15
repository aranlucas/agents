import { AGENT_BACKEND_PATHS, AGENT_ORDER, type AgentId, type ArtifactKind } from "@agents/types";

export { AGENT_BACKEND_PATHS, AGENT_ORDER };
export type { AgentId };
export type ConsoleAgentId = Exclude<AgentId, "oral-boards">;

type ArtifactSource = {
  /** Agent-state field holding the live document content (string or string[]). */
  stateField: string;
  kind: ArtifactKind;
  title: string;
  /** Artifact filename used in Milestone 2 (kept here so the registry is the single source). */
  name: string;
};

export type AgentConfig = {
  id: AgentId;
  access: "authenticated" | "public";
  label: string;
  /** CSS custom property holding the agent accent, e.g. "--travel". */
  colorVar: string;
  /** Tailwind theme utility for the same agent accent. */
  colorClass: string;
  placeholder: string;
  welcome?: string;
  artifact?: ArtifactSource;
  /** Whether this agent needs the user's Kroger account. */
  requiresKroger?: true;
  /** Guidance the active agent uses to generate contextual starter prompts. */
  suggestionInstructions: string;
};

const AGENTS: Record<AgentId, AgentConfig> = {
  travel: {
    id: "travel",
    access: "authenticated",
    label: "Trip Studio",
    colorVar: "--travel",
    colorClass: "text-travel",
    placeholder: "Plan a trip, rework a day, or ask for tradeoffs…",
    welcome: "Tell me where you want to go, your dates, and the kind of trip you want.",
    artifact: {
      stateField: "itinerary",
      kind: "markdown",
      title: "Itinerary",
      name: "itinerary.md",
    },
    suggestionInstructions:
      "Generate concise, specific starter prompts for planning or refining a trip. Vary destinations, constraints, itinerary tradeoffs, and booking readiness.",
  },
  grocery: {
    id: "grocery",
    access: "authenticated",
    requiresKroger: true,
    label: "Grocery",
    colorVar: "--grocery",
    colorClass: "text-grocery",
    placeholder: "Plan meals, build a list, or find deals…",
    artifact: {
      stateField: "shopping_list",
      kind: "list",
      title: "Shopping list",
      name: "shopping_list.json",
    },
    suggestionInstructions:
      "Generate concise, practical starter prompts for meal planning, grocery lists, store deals, pantry restocking, or healthier substitutions.",
  },
  fitness: {
    id: "fitness",
    access: "authenticated",
    label: "Fitness",
    colorVar: "--fitness",
    colorClass: "text-fitness",
    placeholder: "Plan training, log a workout, or set a goal…",
    artifact: {
      stateField: "training_plan",
      kind: "plan",
      title: "Training plan",
      name: "training_plan.md",
    },
    suggestionInstructions:
      "Generate concise, actionable starter prompts for training plans, today's workout, progress goals, activity logging, or recovery decisions.",
  },
  wellness: {
    id: "wellness",
    access: "authenticated",
    requiresKroger: true,
    label: "Wellness",
    colorVar: "--wellness",
    colorClass: "text-wellness",
    placeholder: "Coordinate a week of meals and training…",
    artifact: {
      stateField: "weekly_plan",
      kind: "plan",
      title: "Wellness plan",
      name: "wellness_plan.md",
    },
    suggestionInstructions:
      "Generate concise starter prompts that coordinate meals, workouts, recovery, and weekly preparation into a realistic wellness plan.",
  },
  expense: {
    id: "expense",
    access: "authenticated",
    label: "Expense Desk",
    colorVar: "--expense",
    colorClass: "text-expense",
    placeholder: "Submit an expense or review the queue...",
    welcome: "Submit an expense with amount, submitter, category, description, and date.",
    artifact: {
      stateField: "expense_report",
      kind: "markdown",
      title: "Expense report",
      name: "expense_report.md",
    },
    suggestionInstructions:
      "Generate concise starter prompts for submitting a realistic expense, reviewing an expense, or summarizing the current queue. Include the details needed to act.",
  },
  "oral-boards": {
    id: "oral-boards",
    access: "authenticated",
    label: "Oral Boards",
    colorVar: "--oral-boards",
    colorClass: "text-oral-boards",
    placeholder: "Start a pediatric dentistry oral-board case…",
    welcome: "Name a topic, or ask for a grounded mock oral-board case.",
    artifact: {
      stateField: "case",
      kind: "markdown",
      title: "Case",
      name: "case.md",
    },
    suggestionInstructions:
      "Generate concise starter prompts for grounded pediatric dentistry oral-board practice. Vary case topics, staged scenarios, questioning style, and answer review.",
  },
  trends: {
    id: "trends",
    access: "authenticated",
    label: "Trends",
    colorVar: "--trends",
    colorClass: "text-trends",
    placeholder: "What's trending on Google right now?",
    welcome:
      "Ask me about Google search trends — top terms, rising topics, or regional breakdowns.",
    artifact: {
      stateField: "query",
      kind: "document",
      title: "Trends analysis",
      name: "trends-analysis.md",
    },
    suggestionInstructions:
      "Generate concise starter prompts for exploring current Google search trends. Vary top terms, rising topics, regions, categories, and week-over-week comparisons.",
  },
  resume: {
    id: "resume",
    access: "public",
    label: "Resume",
    colorVar: "--resume",
    colorClass: "text-resume",
    placeholder: "Ask about Lucas…",
    welcome:
      "Ask what Lucas has built, how his personal agents connect to his product work, or share a role and job description for a grounded fit brief.",
    suggestionInstructions:
      "Generate concise questions a visitor can ask about Lucas's experience, personal-agent philosophy, shipped AI products, or fit for a role. Ground every prompt in what this agent can answer and do not invent claims.",
    artifact: {
      stateField: "fit_summary",
      kind: "document",
      title: "Role fit brief",
      name: "role_fit.md",
    },
  },
  research: {
    id: "research",
    access: "authenticated",
    label: "Research",
    colorVar: "--research",
    colorClass: "text-research",
    placeholder: "Ask me to research any topic…",
    welcome: "Tell me what you want to research and I'll build a structured report.",
    artifact: {
      stateField: "report",
      kind: "markdown",
      title: "Research report",
      name: "report.md",
    },
    suggestionInstructions:
      "Generate concise, specific starter prompts for structured research. Vary timely topics, comparisons, evidence reviews, and decision-oriented reports.",
  },
  spreadsheet: {
    id: "spreadsheet",
    access: "authenticated",
    label: "Spreadsheet",
    colorVar: "--spreadsheet",
    colorClass: "text-spreadsheet",
    placeholder: "Ask me to create or analyze a spreadsheet…",
    welcome: "Tell me what kind of spreadsheet you need and I'll build it.",
    suggestionInstructions:
      "Generate concise starter prompts for creating or analyzing useful spreadsheets. Vary personal planning, project tracking, business analysis, and data cleanup tasks.",
  },
  presentation: {
    id: "presentation",
    access: "authenticated",
    label: "Slides",
    colorVar: "--presentation",
    colorClass: "text-presentation",
    placeholder: "Ask me to build a presentation…",
    welcome: "Tell me your topic and I'll build a slide deck for you.",
    suggestionInstructions:
      "Generate concise starter prompts for building a focused presentation. Vary pitches, team communication, research storytelling, and onboarding or educational decks.",
  },
};

export function isAgentId(value: string): value is AgentId {
  return value in AGENTS;
}

export function isConsoleAgentId(value: string): value is ConsoleAgentId {
  return value !== "oral-boards" && isAgentId(value);
}

export function getAgentConfig(id: AgentId): AgentConfig;
export function getAgentConfig(id: string): AgentConfig | undefined;
export function getAgentConfig(id: string): AgentConfig | undefined {
  return isAgentId(id) ? AGENTS[id] : undefined;
}
