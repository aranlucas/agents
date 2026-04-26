import type { AgentState, StoredDateResult, StoredFlightResult } from "./types";

const FLIGHT_RESULT_PREFIX = "flight_result:";
const DATE_RESULT_PREFIX = "date_result:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isFlightResult(value: unknown): value is StoredFlightResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.flights) &&
    isStringRecord(value.args)
  );
}

function isDateResult(value: unknown): value is StoredDateResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ts === "number" &&
    Array.isArray(value.dates) &&
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
