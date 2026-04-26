import type {
  AgentState,
  DatePrice,
  Flight,
  FlightLeg,
  StoredDateResult,
  StoredFlightResult,
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
