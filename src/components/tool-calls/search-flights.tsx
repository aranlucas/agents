"use client";

import {
  useAgent,
  useAgentContext,
  UseAgentUpdate,
  type JsonSerializable,
} from "@copilotkit/react-core/v2";
import { useMemo, useState } from "react";
import { formatMoney, formatPayload } from "../mcp-tool-call/format";
import { toRecord, unwrapResult } from "../mcp-tool-call/payload";
import { buildInputChips } from "../mcp-tool-call/summaries";
import { TONE_CLASSES } from "../mcp-tool-call/tool-meta";
import type { ToolStatus } from "../mcp-tool-call/types";

type Airport = {
  code?: string;
  name?: string;
};

type FlightLeg = {
  departure_airport?: Airport;
  arrival_airport?: Airport;
  departure_time?: string;
  arrival_time?: string;
  airline?: string;
  airline_code?: string;
  flight_number?: string;
};

type Flight = {
  all_in_cost?: number;
  bag_breakdown?: string;
  booking_url?: string;
  carry_on_included?: boolean;
  checked_bags_included?: number;
  currency?: string;
  duration?: number;
  legs?: FlightLeg[] | string;
  price?: number;
  provider?: string;
  self_connect?: boolean;
  stops?: number;
  warnings?: string[];
};

type SearchFlightsState = {
  count?: number;
  flights?: Flight[];
  success?: boolean;
  trip_type?: string;
};

export function SearchFlightsToolCall({
  status,
  name,
  args,
  result,
}: {
  status: ToolStatus;
  name: string;
  args?: unknown;
  result?: unknown;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { agent } = useAgent({
    agentId: "my_agent",
    updates: [UseAgentUpdate.OnStateChanged],
  });

  const running = status === "inProgress" || status === "executing";
  const argsRecord = useMemo(() => toRecord(args), [args]);
  const liveState = (agent?.state ?? {}) as Record<string, unknown>;
  const stateResult = toRecord(liveState.search_flights) as SearchFlightsState | null;
  const parsedResult = useMemo(() => unwrapResult(result), [result]);
  const fallbackResult = toRecord(parsedResult) as SearchFlightsState | null;
  const data = stateResult ?? fallbackResult;
  const flights = Array.isArray(data?.flights) ? data.flights : [];
  const selectedIndex = selectedKey
    ? flights.findIndex((flight, index) => flightKey(flight, index) === selectedKey)
    : -1;
  const selectedFlight = selectedIndex >= 0 ? flights[selectedIndex] : null;
  const chips = buildInputChips(argsRecord);

  if (isExpanded && !running) {
    return (
      <>
        <FlightContext toolName={name} args={args} />
        {selectedFlight && <SelectedFlightContext flight={selectedFlight} />}
        {renderCard()}
      </>
    );
  }

  return (
    <>
      {selectedFlight && <SelectedFlightContext flight={selectedFlight} />}
      {renderCard()}
    </>
  );

  function renderCard() {
    return (
      <section className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50"
          onClick={() => setIsExpanded((open) => !open)}
        >
          <StatusMark running={running} complete={!running} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] ${TONE_CLASSES.sky}`}
              >
                Transport
              </span>
              <span className="truncate text-sm font-semibold text-slate-900">Search flights</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {chips.slice(0, 5).map((chip) => (
                <span
                  key={chip}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.68rem] text-slate-600"
                >
                  {chip}
                </span>
              ))}
            </span>
          </span>
          <span className="text-xs uppercase tracking-[0.12em] text-slate-400">
            {running ? "Running" : flights.length > 0 ? `${data?.count ?? flights.length} flights` : "Done"}
          </span>
        </button>

        {(isExpanded || running || flights.length > 0) && (
          <div className="border-t border-slate-200 bg-slate-50/60 px-3 pb-3 pt-3">
            {running && (
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-400" />
              </div>
            )}

            {flights.length > 0 && (
              <div className="grid gap-2">
                {flights.slice(0, 12).map((flight, index) => {
                  const key = flightKey(flight, index);
                  const selected = selectedKey === key;
                  const summary = summarizeFlight(flight, index);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey((prev) => (prev === key ? null : key))}
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-sky-300 bg-sky-50 ring-1 ring-sky-200"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {summary.title}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">{summary.subtitle}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-emerald-700">
                            {formatMoney(flight.price, flight.currency ?? "USD")}
                          </div>
                          {flight.all_in_cost != null && flight.all_in_cost !== flight.price && (
                            <div className="text-[0.68rem] text-slate-500">
                              all-in {formatMoney(flight.all_in_cost, flight.currency ?? "USD")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[0.68rem] text-slate-600">
                        {summary.badges.map((badge) => (
                          <span key={badge} className="rounded bg-slate-100 px-1.5 py-0.5">
                            {badge}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {isExpanded && (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400 transition-colors hover:text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowJson((show) => !show);
                  }}
                >
                  {showJson ? "Hide exact payload" : "Show exact payload"}
                </button>
                {showJson && (
                  <pre className="mt-2 max-h-[260px] overflow-auto rounded-md border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-700">
                    {formatPayload(data ?? result)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }
}

function summarizeFlight(flight: Flight, index: number) {
  const legs = Array.isArray(flight.legs) ? flight.legs : [];
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const airline = firstLeg?.airline ?? normalizeProvider(flight.provider) ?? `Option ${index + 1}`;
  const flightNumber = [firstLeg?.airline_code, firstLeg?.flight_number].filter(Boolean).join("");
  const origin = firstLeg?.departure_airport?.code;
  const destination = lastLeg?.arrival_airport?.code;
  const route = origin && destination ? `${origin} → ${destination}` : "SEA → MIA";
  const stopText =
    flight.stops === 0 ? "nonstop" : `${flight.stops ?? 0} stop${flight.stops === 1 ? "" : "s"}`;
  const duration = formatDuration(flight.duration);
  const bags =
    flight.checked_bags_included != null
      ? `${flight.checked_bags_included} checked bag${flight.checked_bags_included === 1 ? "" : "s"}`
      : flight.bag_breakdown;
  const badges = [
    duration,
    stopText,
    bags,
    flight.carry_on_included ? "carry-on included" : undefined,
    flight.self_connect ? "self-connect" : undefined,
  ].filter((badge): badge is string => Boolean(badge));

  return {
    title: [airline, flightNumber].filter(Boolean).join(" "),
    subtitle: `${route} · ${stopText}`,
    badges,
  };
}

function flightKey(flight: Flight, index: number): string {
  const legs = Array.isArray(flight.legs) ? flight.legs : [];
  const firstLeg = legs[0];
  const flightNumber = [firstLeg?.airline_code, firstLeg?.flight_number].filter(Boolean).join("");
  return `${flightNumber || flight.provider || "flight"}-${flight.price ?? "na"}-${flight.duration ?? "na"}-${index}`;
}

function formatDuration(minutes: unknown): string | undefined {
  const value = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(value)) return undefined;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

function normalizeProvider(provider?: string): string | undefined {
  if (!provider) return undefined;
  return provider
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusMark({ running, complete }: { running: boolean; complete: boolean }) {
  const classes = complete ? "border-emerald-300 bg-emerald-400/25" : "border-sky-300 bg-sky-400/25";
  return (
    <span className={`relative h-3 w-3 rounded-full border ${classes}`}>
      {running && <span className="absolute inset-[-5px] animate-ping rounded-full bg-sky-300/25" />}
    </span>
  );
}

function FlightContext({ toolName, args }: { toolName: string; args: unknown }) {
  useAgentContext({
    description: "User is currently reviewing flight search results on screen.",
    value: { tool: toolName, args } as unknown as JsonSerializable,
  });
  return null;
}

function SelectedFlightContext({ flight }: { flight: Flight }) {
  useAgentContext({
    description:
      "User has selected a flight option; treat this as the focal candidate when answering follow-ups.",
    value: {
      tool: "search_flights",
      selection: {
        label: summarizeFlight(flight, 0).title,
        data: flight,
      },
    } as unknown as JsonSerializable,
  });
  return null;
}
