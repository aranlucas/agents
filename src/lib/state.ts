import type {
  AgentState,
  DatePrice,
  Flight,
  FlightLeg,
  StoredDateResult,
  StoredFlightResult,
  ActiveTrip,
  HotelOption,
  RouteOption,
  ViabilityCheck,
  ViabilityInfo,
  StoredHotelResult,
  StoredRouteResult,
  StoredViabilityResult,
} from "./types";

const FLIGHT_RESULT_PREFIX = "flight_result:";
const DATE_RESULT_PREFIX = "date_result:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isFlightLeg(value: unknown): value is FlightLeg {
  return (
    isRecord(value) &&
    typeof value.airline === "string" &&
    typeof value.airline_code === "string" &&
    typeof value.flight_number === "string" &&
    typeof value.departure_airport === "string" &&
    typeof value.departure_time === "string" &&
    typeof value.arrival_airport === "string" &&
    typeof value.arrival_time === "string" &&
    typeof value.duration === "number"
  );
}

function isFlight(value: unknown): value is Flight {
  return (
    isRecord(value) &&
    typeof value.price === "number" &&
    typeof value.currency === "string" &&
    Array.isArray(value.legs) &&
    value.legs.every(isFlightLeg) &&
    (value.stops === undefined || typeof value.stops === "number")
  );
}

function isDatePrice(value: unknown): value is DatePrice {
  return (
    isRecord(value) &&
    Array.isArray(value.date) &&
    value.date.every((item) => typeof item === "string") &&
    typeof value.price === "number" &&
    typeof value.currency === "string" &&
    (value.return_date === null || typeof value.return_date === "string")
  );
}

function isFlightResult(value: unknown): value is StoredFlightResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.flights) &&
    value.flights.every(isFlight) &&
    isStringRecord(value.args)
  );
}

function isDateResult(value: unknown): value is StoredDateResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.dates) &&
    value.dates.every(isDatePrice) &&
    isStringRecord(value.args)
  );
}

function collectByPrefix<T>(
  state: AgentState,
  prefix: string,
  predicate: (value: unknown) => value is T
): T[] {
  return Object.entries(state)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .filter(predicate);
}

export function getFlightResults(state: AgentState): StoredFlightResult[] {
  const direct = Array.isArray(state.flight_results) ? state.flight_results.filter(isFlightResult) : [];
  const derived = collectByPrefix(state, FLIGHT_RESULT_PREFIX, isFlightResult);
  return direct.length > 0 ? direct : derived.sort((a, b) => b.ts - a.ts);
}

export function getDateResults(state: AgentState): StoredDateResult[] {
  const direct = Array.isArray(state.date_results) ? state.date_results.filter(isDateResult) : [];
  const derived = collectByPrefix(state, DATE_RESULT_PREFIX, isDateResult);
  return direct.length > 0 ? direct : derived.sort((a, b) => b.ts - a.ts);
}

// --- New Type Guards ---

function isHotelOption(value: unknown): value is HotelOption {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.price === "number" &&
    typeof value.currency === "string"
  );
}

function isRouteOption(value: unknown): value is RouteOption {
  return (
    isRecord(value) &&
    typeof value.price === "number" &&
    typeof value.currency === "string"
  );
}

function isViabilityCheck(value: unknown): value is ViabilityCheck {
  return (
    isRecord(value) &&
    typeof value.dimension === "string" &&
    typeof value.status === "string" &&
    typeof value.summary === "string"
  );
}

function isViabilityInfo(value: unknown): value is ViabilityInfo {
  return (
    isRecord(value) &&
    typeof value.verdict === "string" &&
    Array.isArray(value.checks) &&
    value.checks.every(isViabilityCheck) &&
    typeof value.total_cost === "number" &&
    typeof value.currency === "string"
  );
}

function isActiveTrip(value: unknown): value is ActiveTrip {
  return (
    isRecord(value) &&
    (value.origin === undefined || typeof value.origin === "string") &&
    (value.destination === undefined || typeof value.destination === "string") &&
    (value.updated_at === undefined || typeof value.updated_at === "number")
  );
}

function isStoredHotelResult(value: unknown): value is StoredHotelResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.hotels) &&
    value.hotels.every(isHotelOption) &&
    isStringRecord(value.args)
  );
}

function isStoredRouteResult(value: unknown): value is StoredRouteResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.routes) &&
    value.routes.every(isRouteOption) &&
    isStringRecord(value.args)
  );
}

function isStoredViabilityResult(value: unknown): value is StoredViabilityResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    typeof value.verdict === "string" &&
    Array.isArray(value.checks) &&
    value.checks.every(isViabilityCheck) &&
    typeof value.total_cost === "number" &&
    typeof value.currency === "string" &&
    isStringRecord(value.args)
  );
}

// --- New Selectors ---

export function getActiveTrip(state: AgentState): ActiveTrip | null {
  if (isActiveTrip(state.active_trip)) {
    return state.active_trip;
  }
  return null;
}

export function getHotelResults(state: AgentState): StoredHotelResult[] {
  return Array.isArray(state.hotel_results) ? state.hotel_results.filter(isStoredHotelResult) : [];
}

export function getRouteResults(state: AgentState): StoredRouteResult[] {
  return Array.isArray(state.route_results) ? state.route_results.filter(isStoredRouteResult) : [];
}

export function getViabilityResults(state: AgentState): StoredViabilityResult[] {
  return Array.isArray(state.viability_results) ? state.viability_results.filter(isStoredViabilityResult) : [];
}
