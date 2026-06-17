import { AGENT_BACKEND_PATHS, AGENT_ORDER, type AgentId, type ArtifactKind } from "@agents/types";

import type { ProviderId } from "@/lib/connections";

export { AGENT_BACKEND_PATHS, AGENT_ORDER };
export type { AgentId };

export type ArtifactSource = {
  /** Agent-state field holding the live document content (string or string[]). */
  stateField: string;
  kind: ArtifactKind;
  title: string;
  /** Artifact filename used in Milestone 2 (kept here so the registry is the single source). */
  name: string;
};

export type Suggestion = {
  title: string;
  message: string;
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
  suggestions?: Suggestion[];
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
    suggestions: [
      {
        title: "Weekend in Tokyo",
        message: "Plan a 3-day weekend in Tokyo focused on food, late November.",
      },
      {
        title: "Family in Lisbon",
        message: "Plan a 5-day family trip to Lisbon next summer, kids 7 and 10.",
      },
      {
        title: "Rework Day 2",
        message:
          "Day 2 feels too packed — rework it with a slower morning and one anchor activity in the afternoon.",
      },
      {
        title: "Ready to book?",
        message: "If the itinerary looks good, propose locking it in and ask for my approval.",
      },
    ],
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
    suggestions: [
      { title: "Meals for the week", message: "Plan 5 quick weeknight dinners for this week." },
      { title: "What's on sale?", message: "What deals are available at my store this week?" },
      {
        title: "Check my pantry",
        message: "Look at what I have and tell me what I'm running low on.",
      },
      {
        title: "Healthy swaps",
        message: "Suggest healthier alternatives for common items on my list.",
      },
    ],
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
    suggestions: [
      { title: "Plan this week", message: "Build a 5-day training plan for this week." },
      { title: "What today?", message: "What should I do today based on my recent activity?" },
      { title: "Set a goal", message: "Help me set a realistic fitness goal for the next month." },
      {
        title: "Recovery check",
        message: "I'm feeling tired — should I rest or do a light workout today?",
      },
    ],
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
    suggestions: [
      {
        title: "Coordinate week",
        message: "Create a coordinated meal and workout plan for this week.",
      },
      { title: "Balance check", message: "How balanced are my meals and training this week?" },
      {
        title: "Recovery day",
        message: "Suggest a recovery day with light movement and nourishing meals.",
      },
      { title: "Sunday prep", message: "Help me plan a Sunday meal prep and training session." },
    ],
  },
  "oral-boards": {
    id: "oral-boards",
    label: "Oral Boards",
    glyph: "◆",
    colorVar: "--oral-boards",
    placeholder: "Start a pediatric dentistry oral-board case…",
    welcome: "Name a topic, or ask for a grounded mock oral-board case.",
    suggestions: [
      {
        title: "Start a case",
        message: "Run a grounded pediatric dentistry oral-board case.",
      },
      {
        title: "Pulp therapy",
        message: "Create an oral-board case focused on pulp therapy.",
      },
      {
        title: "Trauma scenario",
        message: "Give me a staged OCE-style trauma case.",
      },
      {
        title: "Score my answer",
        message: "Ask one question at a time and grade my answer with citations.",
      },
    ],
  },
  "oral-boards-v2": {
    id: "oral-boards-v2",
    label: "Oral Boards v2",
    glyph: "◇",
    colorVar: "--oral-boards",
    placeholder: "Start a graph-based oral-board case (workflow)…",
    welcome: "This is the workflow-based oral boards examiner. Name a topic or start a case.",
    suggestions: [
      {
        title: "Start a case",
        message: "Run a grounded pediatric dentistry oral-board case.",
      },
      {
        title: "Pulp therapy",
        message: "Create an oral-board case focused on pulp therapy.",
      },
      {
        title: "Trauma scenario",
        message: "Give me a staged OCE-style trauma case.",
      },
    ],
  },
  a2ui: {
    id: "a2ui",
    label: "A2UI",
    glyph: "▦",
    colorVar: "--a2ui",
    placeholder: "Ask me to render an interface…",
    suggestions: [
      { title: "Dashboard", message: "Render a sales dashboard with charts and KPI cards." },
      { title: "Data table", message: "Show me a sortable data table with sample data." },
      { title: "Build a form", message: "Create a contact form with validation." },
      { title: "Kanban", message: "Show a kanban board with a few sample cards." },
    ],
  },
  resume: {
    id: "resume",
    label: "Resume",
    glyph: "▣",
    colorVar: "--resume",
    placeholder: "Ask about Lucas's experience, skills, or projects…",
    welcome:
      "Hi! I can answer questions about Lucas's background, experience, and skills. What would you like to know?",
    suggestions: [
      { title: "Experience", message: "Walk me through Lucas's work experience." },
      { title: "Tech stack", message: "What technologies is Lucas strongest in?" },
      { title: "Recent projects", message: "What has Lucas built recently?" },
      {
        title: "Good fit?",
        message: "Why would Lucas be a good fit for a senior engineering role?",
      },
    ],
  },
};

export function isAgentId(value: string): value is AgentId {
  return value in AGENTS;
}

export function getAgentConfig(id: AgentId): AgentConfig;
export function getAgentConfig(id: string): AgentConfig | undefined;
export function getAgentConfig(id: string): AgentConfig | undefined {
  return isAgentId(id) ? AGENTS[id] : undefined;
}
