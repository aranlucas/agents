"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface FlightLeg {
  departure_airport: { code: string; name: string };
  arrival_airport: { code: string; name: string };
  departure_time: string;
  arrival_time: string;
  duration: number;
  airline: string;
  airline_code: string;
  flight_number: string;
  aircraft?: string;
  layover_minutes?: number;
}

interface Flight {
  price: number;
  currency: string;
  duration: number;
  stops: number;
  provider?: string;
  self_connect?: boolean;
  warnings?: string[];
  legs?: FlightLeg[];
}

function extractFlights(result: unknown): Flight[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.flights) ? (record.flights as Flight[]) : [];
}

function flightKey(item: Flight, index: number): string {
  const leg = item.legs?.[0];
  if (leg) return `${leg.airline_code}${leg.flight_number}-${item.price}-${index}`;
  return `flight-${index}`;
}

function flightSummary(item: Flight) {
  const firstLeg = item.legs?.[0];
  const lastLeg = item.legs?.[item.legs.length - 1];
  const origin = firstLeg?.departure_airport.code ?? "";
  const dest = lastLeg?.arrival_airport.code ?? "";
  const airline = firstLeg?.airline ?? item.provider ?? "";
  const flightNum = firstLeg ? `${firstLeg.airline_code}${firstLeg.flight_number}` : "";
  const title = [airline, flightNum].filter(Boolean).join(" ");
  const stopLabel = item.stops === 0 ? "Nonstop" : `${item.stops} stop${item.stops === 1 ? "" : "s"}`;
  const durationH = Math.floor(item.duration / 60);
  const durationM = item.duration % 60;
  const durationStr = durationH > 0 ? `${durationH}h ${durationM}m` : `${durationM}m`;
  const detail = [durationStr, item.self_connect ? "⚠ self-connect" : ""].filter(Boolean).join(" · ");

  return {
    title,
    subtitle: [origin && dest ? `${origin} → ${dest}` : "", stopLabel].filter(Boolean).join(" · "),
    detail: detail || undefined,
    price: formatMoney(item.price, item.currency),
  };
}

function flightLabel(item: Flight): string {
  const firstLeg = item.legs?.[0];
  const lastLeg = item.legs?.[item.legs?.length - 1];
  const origin = firstLeg?.departure_airport.code ?? "";
  const dest = lastLeg?.arrival_airport.code ?? "";
  const airline = firstLeg?.airline ?? item.provider ?? "";
  const flightNum = firstLeg ? `${firstLeg.airline_code}${firstLeg.flight_number}` : "";
  return `${airline} ${flightNum} ${origin}→${dest} @ ${item.price} ${item.currency}`;
}

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
  return (
    <SelectableListToolCall
      status={status}
      name={name}
      args={args}
      result={result}
      extractItems={extractFlights}
      itemKey={flightKey}
      itemSummary={flightSummary}
      selectionLabel={flightLabel}
    />
  );
}
