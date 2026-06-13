export const AGENT_ORDER = [
  "travel",
  "grocery",
  "fitness",
  "wellness",
  "oral-boards",
  "a2ui",
  "resume",
] as const;

export type AgentId = (typeof AGENT_ORDER)[number];

export const AGENT_BACKEND_PATHS = {
  travel: "travel",
  grocery: "grocery",
  fitness: "fitness",
  wellness: "wellness",
  "oral-boards": "oralboards",
  a2ui: "a2ui",
  resume: "resume",
} as const satisfies Record<AgentId, string>;

export type AgentBackendPath = (typeof AGENT_BACKEND_PATHS)[AgentId];

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

// Oral boards examiner state — matches what agents/oralboards writes to ADK shared state
export type OralBoardsPhase = "idle" | "presenting" | "questioning" | "feedback" | "complete";

export type CaseSource = {
  docid: number;
  title: string;
  collection: "abpd" | "aapd" | "cody";
};

export type OralBoardsExchange = {
  question: string;
  answer: string;
  feedback: string;
  citations: CaseSource[];
};

export type OralBoardsState = {
  case?: string;
  case_sources?: CaseSource[];
  phase?: OralBoardsPhase;
  transcript?: OralBoardsExchange[];
  score_card?: string;
  status?: OralBoardsPhase | "idle";
};

// A2UI showcase state — matches what agents/a2ui writes to ADK shared state
export type A2UIStatus = "idle" | "ready";

export type A2UIState = {
  status?: A2UIStatus;
  surface_brief?: string;
  last_surface?: string;
  user_id?: string;
};
