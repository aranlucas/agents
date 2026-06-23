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
  PantryItem,
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
const WELLNESS_STATUSES: readonly WellnessStatus[] = ["idle", "delegating", "planning", "ready"];

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
    name: str(s.name),
    sport_type: optionalStr(s.sport_type),
    start_date: optionalStr(s.start_date),
    distance_m: optionalNum(s.distance_m),
    moving_time_s: optionalNum(s.moving_time_s),
    elapsed_time_s: optionalNum(s.elapsed_time_s),
    total_elevation_gain_m: optionalNum(s.total_elevation_gain_m),
    average_heartrate: optionalNum(s.average_heartrate),
    perceived_effort: optionalNum(s.perceived_effort),
  };
}

export function toFitnessState(raw: unknown): FitnessState {
  const s = asRecord(raw);
  return {
    strava_connected: bool(s.strava_connected),
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
    workout_plan: str(s.workout_plan),
    weekly_plan: str(s.weekly_plan),
    review_summary: optionalStr(s.review_summary),
    last_delegation: isRecord(s.last_delegation) ? s.last_delegation : undefined,
    user_id: optionalStr(s.user_id),
    kroger_connected: bool(s.kroger_connected),
    strava_connected: bool(s.strava_connected),
  };
}
