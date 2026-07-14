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

type Suggestion = {
  title: string;
  message: string;
};

export type AgentConfig = {
  id: AgentId;
  label: string;
  glyph: string;
  /** CSS custom property holding the agent accent, e.g. "--travel". */
  colorVar: string;
  /** Tailwind theme utility for the same agent accent. */
  colorClass: string;
  placeholder: string;
  welcome?: string;
  artifact?: ArtifactSource;
  /** Whether this agent needs the user's Kroger account. */
  requiresKroger?: true;
  suggestions?: Suggestion[];
};

const AGENTS: Record<AgentId, AgentConfig> = {
  travel: {
    id: "travel",
    label: "Trip Studio",
    glyph: "✈",
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
        message: "If the itinerary looks good, get it ready to book.",
      },
    ],
  },
  grocery: {
    id: "grocery",
    requiresKroger: true,
    label: "Grocery",
    glyph: "🛒",
    colorVar: "--grocery",
    colorClass: "text-grocery",
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
    label: "Fitness",
    glyph: "💪",
    colorVar: "--fitness",
    colorClass: "text-fitness",
    placeholder: "Plan training, log a workout, or set a goal…",
    artifact: {
      stateField: "training_plan",
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
    requiresKroger: true,
    label: "Wellness",
    glyph: "☯",
    colorVar: "--wellness",
    colorClass: "text-wellness",
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
  expense: {
    id: "expense",
    label: "Expense Desk",
    glyph: "$",
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
    suggestions: [
      {
        title: "Travel expense",
        message:
          "Review a $250 travel expense from alice@example.com for a flight to NYC on 2026-06-18.",
      },
      {
        title: "Meal receipt",
        message:
          "Submit a $45.50 meals expense from ben@example.com for a team lunch on 2026-06-18.",
      },
      {
        title: "Summarize queue",
        message: "Write a concise markdown report of the current expense queue by status.",
      },
    ],
  },
  "oral-boards": {
    id: "oral-boards",
    label: "Oral Boards",
    glyph: "◆",
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
  trends: {
    id: "trends",
    label: "Trends",
    glyph: "📈",
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
    suggestions: [
      {
        title: "Top searches",
        message: "Visualize the top 10 Google searches in the US for the latest available week.",
      },
      {
        title: "Fastest rising",
        message: "Show the fastest-rising US search terms and compare their percent gains.",
      },
      {
        title: "California",
        message: "Visualize the leading search terms in California for the latest available week.",
      },
      {
        title: "Weekly change",
        message: "Show how the leading AI-related search terms changed across recent weeks.",
      },
    ],
  },
  resume: {
    id: "resume",
    label: "Resume",
    glyph: "▣",
    colorVar: "--resume",
    colorClass: "text-resume",
    placeholder: "Ask about Lucas, this lab, or a specific role…",
    welcome:
      "Ask how this agent lab connects to Lucas's work, ask about his background, or share a job description for a grounded fit brief.",
    artifact: {
      stateField: "fit_summary",
      kind: "document",
      title: "Role fit brief",
      name: "role_fit.md",
    },
    suggestions: [
      {
        title: "What is this lab?",
        message: "What is Lucas building in this agent lab, and how does it connect to his work?",
      },
      {
        title: "How he works",
        message: "How does Lucas take an AI product from an idea to a working launch?",
      },
      {
        title: "AI platform role",
        message: "Assess Lucas's fit for a Staff AI Platform Engineer role.",
      },
      {
        title: "Tailor bullets",
        message: "Tailor Lucas's strongest resume bullets for a Staff AI Platform Engineer role.",
      },
    ],
  },
  research: {
    id: "research",
    label: "Research",
    glyph: "🔬",
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
    suggestions: [
      { title: "AI in healthcare", message: "Research the current state of AI in healthcare." },
      {
        title: "Climate solutions",
        message: "Research the most promising climate change mitigation technologies.",
      },
      {
        title: "Quantum computing",
        message: "Give me a comprehensive overview of quantum computing and its applications.",
      },
      {
        title: "Startup ecosystems",
        message: "Research the top global startup ecosystems and what makes them successful.",
      },
    ],
  },
  spreadsheet: {
    id: "spreadsheet",
    label: "Spreadsheet",
    glyph: "📊",
    colorVar: "--spreadsheet",
    colorClass: "text-spreadsheet",
    placeholder: "Ask me to create or analyze a spreadsheet…",
    welcome: "Tell me what kind of spreadsheet you need and I'll build it.",
    suggestions: [
      {
        title: "Budget tracker",
        message: "Create a monthly budget tracker with income and expense categories.",
      },
      {
        title: "Project timeline",
        message: "Build a project timeline spreadsheet with tasks, owners, and due dates.",
      },
      {
        title: "Sales data",
        message: "Create a sales data sheet with Q1–Q4 revenue by product line.",
      },
      {
        title: "Workout log",
        message: "Make a workout log tracking exercises, sets, reps, and weight over 4 weeks.",
      },
    ],
  },
  presentation: {
    id: "presentation",
    label: "Slides",
    glyph: "🎞",
    colorVar: "--presentation",
    colorClass: "text-presentation",
    placeholder: "Ask me to build a presentation…",
    welcome: "Tell me your topic and I'll build a slide deck for you.",
    suggestions: [
      {
        title: "Product pitch",
        message: "Create a 10-slide pitch deck for a SaaS product targeting small businesses.",
      },
      {
        title: "Team meeting",
        message: "Build a weekly team meeting slide deck with agenda, updates, and action items.",
      },
      {
        title: "Research findings",
        message: "Create a presentation summarizing key findings on remote work productivity.",
      },
      {
        title: "Onboarding deck",
        message: "Build a 8-slide employee onboarding presentation covering culture and process.",
      },
    ],
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
