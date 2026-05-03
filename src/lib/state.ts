import type {
  AgentState,
  ActiveTrip,
  HotelOption,
  RouteOption,
  ViabilityCheck,
  ViabilityInfo,
  StoredHotelResult,
  StoredRouteResult,
  StoredViabilityResult,
  TripLeg,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

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

function isTripLeg(value: unknown): value is TripLeg {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    (value.provider === undefined || typeof value.provider === "string") &&
    typeof value.confirmed === "boolean" &&
    (value.price === undefined || typeof value.price === "number") &&
    (value.currency === undefined || typeof value.currency === "string") &&
    (value.reference === undefined || typeof value.reference === "string")
  );
}

function isActiveTrip(value: unknown): value is ActiveTrip {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.status === undefined || typeof value.status === "string") &&
    (value.origin === undefined || typeof value.origin === "string") &&
    (value.destination === undefined ||
      typeof value.destination === "string") &&
    (value.legs === undefined ||
      (Array.isArray(value.legs) && value.legs.every(isTripLeg))) &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string"))) &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.source_updated_at === undefined ||
      typeof value.source_updated_at === "string") &&
    (value.updated_at === undefined ||
      typeof value.updated_at === "number" ||
      typeof value.updated_at === "string")
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

function isStoredViabilityResult(
  value: unknown,
): value is StoredViabilityResult {
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
  return Array.isArray(state.hotel_results)
    ? state.hotel_results.filter(isStoredHotelResult)
    : [];
}

export function getRouteResults(state: AgentState): StoredRouteResult[] {
  return Array.isArray(state.route_results)
    ? state.route_results.filter(isStoredRouteResult)
    : [];
}

export function getViabilityResults(
  state: AgentState,
): StoredViabilityResult[] {
  return Array.isArray(state.viability_results)
    ? state.viability_results.filter(isStoredViabilityResult)
    : [];
}
