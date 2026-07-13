// Coercion helpers that turn an agent's untyped (`any`) shared state into the
// strongly-typed state shapes the UI renders. ADK streams partial deltas, so we
// read each field defensively and fall back to sensible defaults rather than
// asserting the raw value into a typed object. Keeping these pure makes them
// trivially testable and keeps `as` casts out of the page components.

import type {
  CartItem,
  DocStatus,
  FitnessActivity,
  FitnessState,
  FitnessStatus,
  GroceryState,
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsPhase,
  OralBoardsSkill,
  OralBoardsSkillsetScore,
  OralBoardsState,
  CaseSource,
  PantryItem,
  ResumeState,
  ResumeStatus,
  TrendsRow,
  TrendsState,
  TrendsStatus,
  TripState,
  WellnessState,
  WellnessStatus,
} from "@agents/types";

/** Type guard for a plain object. Avoids an `as` cast when narrowing `unknown`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Returns `value` if it is one of `allowed`, otherwise `fallback`. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const DOC_STATUSES: readonly DocStatus[] = ["idle", "drafting", "ready_to_book", "booked"];
const GROCERY_STATUSES = ["idle", "planning", "ready"] as const;
const FITNESS_STATUSES: readonly FitnessStatus[] = ["idle", "syncing", "planning", "ready"];
const FITNESS_SOURCES = ["health_connect", "healthkit", "strava", "strava_import"] as const;
const WELLNESS_STATUSES: readonly WellnessStatus[] = ["idle", "delegating", "planning", "ready"];
const ORAL_PHASES: readonly OralBoardsPhase[] = [
  "idle",
  "presenting",
  "questioning",
  "feedback",
  "complete",
];
const ORAL_SKILLS: readonly OralBoardsSkill[] = [
  "remember",
  "understand_apply",
  "analyze_evaluate",
];
const ORAL_OUTCOMES: readonly OralBoardsOutcome[] = ["pass", "borderline", "not_yet"];
const RESUME_STATUSES: readonly ResumeStatus[] = ["idle", "analyzing", "ready"];
const TRENDS_STATUSES: readonly TrendsStatus[] = ["idle", "querying", "ready", "empty", "error"];

export function asDocStatus(value: unknown): DocStatus {
  return oneOf(value, DOC_STATUSES, "idle");
}

export function toTripState(raw: unknown): TripState {
  const s = asRecord(raw);
  return {
    destination: str(s.destination),
    start_date: str(s.start_date),
    end_date: str(s.end_date),
    travelers: num(s.travelers),
    budget_usd: num(s.budget_usd),
    headline: str(s.headline),
    summary: str(s.summary),
    itinerary: str(s.itinerary),
    flights: str(s.flights),
    status: asDocStatus(s.status),
    review_summary: optionalStr(s.review_summary),
  };
}

function toCartItem(raw: unknown): CartItem {
  const s = asRecord(raw);
  return {
    name: str(s.name),
    quantity: num(s.quantity),
    price: optionalNum(s.price),
    upc: optionalStr(s.upc),
  };
}

function toPantryItem(raw: unknown): PantryItem {
  const s = asRecord(raw);
  return {
    name: str(s.name),
    quantity: str(s.quantity),
    expires: optionalStr(s.expires),
  };
}

export function toGroceryState(raw: unknown): GroceryState {
  const s = asRecord(raw);
  return {
    shopping_list: strArray(s.shopping_list),
    cart: Array.isArray(s.cart) ? s.cart.map(toCartItem) : [],
    pantry: Array.isArray(s.pantry) ? s.pantry.map(toPantryItem) : [],
    meal_plan: str(s.meal_plan),
    weekly_deals: str(s.weekly_deals),
    status: oneOf(s.status, GROCERY_STATUSES, "idle"),
    notes: str(s.notes),
    review_summary: optionalStr(s.review_summary),
    kroger_connected: bool(s.kroger_connected),
  };
}

function toFitnessActivity(raw: unknown): FitnessActivity {
  const s = asRecord(raw);
  return {
    id: str(s.id),
    source: FITNESS_SOURCES.find((source) => source === s.source),
    name: str(s.name),
    sport_type: optionalStr(s.sport_type),
    start_date: optionalStr(s.start_date),
    end_date: optionalStr(s.end_date),
    distance_m: optionalNum(s.distance_m),
    moving_time_s: optionalNum(s.moving_time_s),
    elapsed_time_s: optionalNum(s.elapsed_time_s),
    total_elevation_gain_m: optionalNum(s.total_elevation_gain_m),
    average_heartrate: optionalNum(s.average_heartrate),
    perceived_effort: optionalNum(s.perceived_effort),
    data_origin: optionalStr(s.data_origin),
  };
}

export function toFitnessState(raw: unknown): FitnessState {
  const s = asRecord(raw);
  return {
    fitness_data_connected: bool(s.fitness_data_connected),
    activity_source: optionalStr(s.activity_source),
    activities: Array.isArray(s.activities) ? s.activities.map(toFitnessActivity) : [],
    activities_synced_at: optionalStr(s.activities_synced_at),
    objective_research: str(s.objective_research),
    training_plan: str(s.training_plan),
    status: oneOf(s.status, FITNESS_STATUSES, "idle"),
    review_summary: optionalStr(s.review_summary),
  };
}

export function toWellnessState(raw: unknown): WellnessState {
  const s = asRecord(raw);
  return {
    status: oneOf(s.status, WELLNESS_STATUSES, "idle"),
    meal_plan: str(s.meal_plan),
    training_plan: str(s.training_plan),
    weekly_plan: str(s.weekly_plan),
    review_summary: optionalStr(s.review_summary),
    kroger_connected: bool(s.kroger_connected),
    fitness_data_connected: bool(s.fitness_data_connected),
    activity_source: optionalStr(s.activity_source),
  };
}

export function toResumeState(raw: unknown): ResumeState {
  const state = asRecord(raw);
  return {
    target_role: str(state.target_role),
    job_description: str(state.job_description),
    fit_summary: str(state.fit_summary),
    gaps: strArray(state.gaps),
    tailored_bullets: strArray(state.tailored_bullets),
    status: oneOf(state.status, RESUME_STATUSES, "idle"),
    review_summary: str(state.review_summary),
  };
}

function toTrendsRow(raw: unknown): TrendsRow {
  const source = asRecord(raw);
  const row: TrendsRow = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      row[key] = value;
    }
  }
  return row;
}

export function toTrendsState(raw: unknown): TrendsState {
  const state = asRecord(raw);
  return {
    query: str(state.query),
    generated_sql: str(state.generated_sql),
    columns: strArray(state.columns),
    rows: Array.isArray(state.rows) ? state.rows.map(toTrendsRow) : [],
    insights: str(state.insights),
    status: oneOf(state.status, TRENDS_STATUSES, "idle"),
    error: str(state.error),
  };
}

function toCaseSource(raw: unknown): CaseSource {
  const source = asRecord(raw);
  return {
    docid: num(source.docid),
    filepath: str(source.filepath),
    title: str(source.title),
    collection: oneOf(source.collection, ["abpd", "aapd", "cody"] as const, "aapd"),
  };
}

function toOralExchange(raw: unknown): OralBoardsExchange {
  const exchange = asRecord(raw);
  const score = num(exchange.score);
  return {
    question: str(exchange.question),
    answer: str(exchange.answer),
    feedback: str(exchange.feedback),
    ideal_response: str(exchange.ideal_response),
    citations: Array.isArray(exchange.citations) ? exchange.citations.map(toCaseSource) : [],
    skillset: optionalStr(exchange.skillset),
    skill: ORAL_SKILLS.find((value) => value === exchange.skill),
    score: score === 1 || score === 2 || score === 3 ? score : undefined,
  };
}

function toSkillsetScore(raw: unknown): OralBoardsSkillsetScore | undefined {
  const score = asRecord(raw);
  const value = num(score.score);
  if (value !== 1 && value !== 2 && value !== 3) return undefined;
  return {
    skillset: str(score.skillset),
    skill: ORAL_SKILLS.find((item) => item === score.skill),
    score: value,
    rationale: str(score.rationale),
  };
}

export function toOralBoardsState(raw: unknown): OralBoardsState {
  const state = asRecord(raw);
  return {
    case: str(state.case),
    case_sources: Array.isArray(state.case_sources) ? state.case_sources.map(toCaseSource) : [],
    transcript: Array.isArray(state.transcript) ? state.transcript.map(toOralExchange) : [],
    score_card: str(state.score_card),
    score_summary: Array.isArray(state.score_summary)
      ? state.score_summary
          .map(toSkillsetScore)
          .filter((value): value is OralBoardsSkillsetScore => value !== undefined)
      : [],
    outcome: ORAL_OUTCOMES.find((value) => value === state.outcome),
    status: oneOf(state.status, ORAL_PHASES, "idle"),
    loading_step: str(state.loading_step),
    current_question: str(state.current_question),
    interview_complete: bool(state.interview_complete),
    active_feedback: str(state.active_feedback),
    active_ideal_response: str(state.active_ideal_response),
    active_probe: str(state.active_probe),
  };
}
