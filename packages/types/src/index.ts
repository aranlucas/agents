export const AGENT_ORDER = [
  "excalidraw",
  "travel",
  "grocery",
  "fitness",
  "wellness",
  "expense",
  "oral-boards",
  "trends",
  "resume",
  "research",
  "spreadsheet",
  "presentation",
] as const;

export type AgentId = (typeof AGENT_ORDER)[number];

export const AGENT_BACKEND_PATHS = {
  excalidraw: "excalidraw",
  travel: "travel",
  grocery: "grocery",
  fitness: "fitness",
  wellness: "wellness",
  expense: "expense",
  "oral-boards": "oralboards",
  trends: "trends",
  resume: "resume",
  research: "research",
  spreadsheet: "spreadsheet",
  presentation: "presentation",
} as const satisfies Record<AgentId, string>;

// Travel agent state — matches what agents/travel writes to ADK shared state
export type DocStatus = "idle" | "drafting" | "ready_to_book" | "booked";

// Artifact kinds rendered by the shared console artifact panel
export type ArtifactKind = "markdown" | "document" | "list" | "code" | "plan";

export type TripState = {
  destination?: string;
  start_date?: string;
  end_date?: string;
  travelers?: number;
  budget_usd?: number;
  headline?: string;
  summary?: string;
  itinerary?: string;
  flights?: string;
  status?: DocStatus;
  review_summary?: string;
};

// Grocery agent state — matches what agents/grocery writes to ADK shared state
export type GroceryState = {
  shopping_list?: string[];
  cart?: CartItem[];
  pantry?: PantryItem[];
  meal_plan?: string;
  weekly_deals?: string;
  status?: "idle" | "planning" | "ready";
  notes?: string;
  review_summary?: string;
  kroger_connected?: boolean;
};

export type CartItem = {
  name: string;
  quantity: number;
  price?: number;
  upc?: string;
};

export type PantryItem = {
  name: string;
  quantity: string;
  expires?: string;
};

// User preferences — shared across both agents
export type TransportMode = "flight" | "road_trip";
export type BudgetTier = "shoestring" | "comfort" | "premium" | "luxury";
export type Vibe = "relaxed" | "adventure" | "foodie" | "culture" | "nightlife" | "family";
export type Pace = "slow" | "balanced" | "packed";

export type Preferences = {
  travelerName: string;
  homeAirport: string;
  transportMode: TransportMode;
  budgetTier: BudgetTier;
  vibe: Vibe;
  pace: Pace;
  interests: string[];
};

// Fitness agent state — matches what agents/fitness writes to ADK shared state
export type FitnessStatus = "idle" | "syncing" | "planning" | "ready";

export type FitnessActivity = {
  id: string;
  name: string;
  sport_type?: string;
  start_date?: string;
  distance_m?: number;
  moving_time_s?: number;
  elapsed_time_s?: number;
  total_elevation_gain_m?: number;
  average_heartrate?: number;
  perceived_effort?: number;
};

export type FitnessState = {
  strava_connected?: boolean;
  activities?: FitnessActivity[];
  activities_synced_at?: string;
  objective_research?: string;
  training_plan?: string;
  status?: FitnessStatus;
  review_summary?: string;
};

// Wellness orchestrator state — matches what agents/wellness writes to ADK shared state
export type WellnessStatus = "idle" | "delegating" | "planning" | "ready";

export type WellnessState = {
  status?: WellnessStatus;
  meal_plan?: string;
  workout_plan?: string;
  weekly_plan?: string;
  review_summary?: string;
  last_delegation?: Record<string, unknown>;
  user_id?: string;
  kroger_connected?: boolean;
  strava_connected?: boolean;
};

// Expense Desk state — matches what agents/expense writes to ADK shared state
export type ExpenseStatus =
  | "submitted"
  | "auto_approved"
  | "needs_review"
  | "approved"
  | "rejected";

export type ExpenseRiskLevel = "low" | "medium" | "high";
export type ExpenseDeskStatus = "idle" | "reviewing" | "needs_approval" | "ready";

export type ExpenseItem = {
  id: string;
  amount: number;
  submitter: string;
  category: string;
  description: string;
  date: string;
  status: ExpenseStatus;
  risk_level?: ExpenseRiskLevel | null;
  risk_summary?: string;
  recommendation?: string;
  decision_note?: string;
};

export type ExpenseState = {
  expenses?: ExpenseItem[];
  selected_expense_id?: string;
  expense_report?: string;
  status?: ExpenseDeskStatus;
  review_summary?: string;
  review_threshold_usd?: number;
  user_id?: string;
};

// Oral boards examiner state — matches what agents/oralboards writes to ADK shared state
export type OralBoardsPhase = "idle" | "presenting" | "questioning" | "feedback" | "complete";

export type CaseSource = {
  docid: number;
  filepath: string;
  title: string;
  collection: "abpd" | "aapd" | "cody";
};

// Cognitive skill level from the ABPD OCE Examination Blueprint "Skill" column.
export type OralBoardsSkill = "remember" | "understand_apply" | "analyze_evaluate";

// Overall practice-outcome estimate. The real OCE is reported Pass/Fail by
// examiners; "borderline" / "not_yet" are study-aid gradations, not official ABPD
// categories.
export type OralBoardsOutcome = "pass" | "borderline" | "not_yet";

// Display metadata for the three blueprint skill levels. Shared by the agent
// (authoritative copy lives in the agent prompt) and the exam UI legend/badges.
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

export type OralBoardsExchange = {
  question: string;
  answer: string;
  feedback: string;
  ideal_response: string;
  citations: CaseSource[];
  // Blueprint domain ("skillset") this question assessed, e.g. "Pulp Therapy".
  skillset?: string;
  // Cognitive level the question targeted.
  skill?: OralBoardsSkill;
  // Practice score for this skillset on the official ABPD 1-3 scale.
  score?: 1 | 2 | 3;
};

export type OralBoardsSkillsetScore = {
  skillset: string;
  skill?: OralBoardsSkill;
  score: 1 | 2 | 3;
  rationale: string;
};

export type OralBoardsState = {
  case?: string;
  case_sources?: CaseSource[];
  case_passages?: string;
  transcript?: OralBoardsExchange[];
  score_card?: string;
  // Structured per-skillset scores backing the feedback score table.
  score_summary?: OralBoardsSkillsetScore[];
  // Overall practice-outcome estimate (study aid; real OCE is Pass/Fail).
  outcome?: OralBoardsOutcome;
  status?: OralBoardsPhase | "idle";
  loading_step?: string;
  interview_complete?: boolean;
  // Streamed token-by-token while append_exchange generates — rendered live in
  // the panel before the exchange commits to transcript.
  active_feedback?: string;
  active_ideal_response?: string;
  // Written by the ask_question frontend tool so the active question survives
  // a page refresh (reconstructed from agent state on mount).
  current_question?: string;
  // Follow-up probe asked by the evaluator via ask_probe — shown as the active
  // question until append_exchange clears it.
  active_probe?: string;
  question_craft_feedback?: string;
  user_id?: string;
};

// Research agent state — matches what agents/research writes to ADK shared state
export type ResearchStatus = "idle" | "drafting" | "ready";

export type ResearchSection = {
  id: string;
  title: string;
  content: string;
};

export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
};

export type ResearchState = {
  title?: string;
  query?: string;
  report?: string;
  sections?: ResearchSection[];
  sources?: ResearchSource[];
  status?: ResearchStatus;
  review_summary?: string;
  user_id?: string;
};

// Spreadsheet agent state — matches what agents/spreadsheet writes to ADK shared state
export type SpreadsheetSheet = {
  title: string;
  rows: string[][];
};

export type SpreadsheetState = {
  sheets?: SpreadsheetSheet[];
  active_sheet_index?: number;
  summary?: string;
  status?: "idle" | "ready";
  review_summary?: string;
  user_id?: string;
};

// Presentation agent state — matches what agents/presentation writes to ADK shared state
export type PresentationSlideType = "title" | "content" | "bullets" | "two-column";
export type PresentationTheme = "light" | "dark" | "minimal";
export type PresentationStatus = "idle" | "drafting" | "ready";

export type PresentationSlide = {
  id: string;
  type: PresentationSlideType;
  heading: string;
  body: string;
  notes: string;
};

export type PresentationState = {
  title?: string;
  theme?: PresentationTheme;
  slides?: PresentationSlide[];
  active_slide_index?: number;
  status?: PresentationStatus;
  review_summary?: string;
  user_id?: string;
};

// Trends agent state — matches what agents/trends writes to ADK shared state
export type TrendsStatus = "idle" | "querying" | "ready" | "empty" | "error";
export type TrendsCell = string | number | boolean | null;
export type TrendsRow = Record<string, TrendsCell>;

export type TrendsState = {
  query?: string;
  generated_sql?: string;
  columns?: string[];
  rows?: TrendsRow[];
  insights?: string;
  status?: TrendsStatus;
  error?: string;
  user_id?: string;
};
