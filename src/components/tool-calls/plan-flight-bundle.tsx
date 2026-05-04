"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface BundleLeg {
  departure_airport: { code: string; name: string };
  arrival_airport: { code: string; name: string };
  airline: string;
  airline_code: string;
  flight_number: string;
}

interface FlightBundle {
  price: number;
  currency: string;
  duration: number;
  stops: number;
  provider?: string;
  self_connect?: boolean;
  legs?: BundleLeg[];
}

function extractBundles(result: unknown): FlightBundle[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.flights) ? (record.flights as FlightBundle[]) : [];
}

function bundleKey(item: FlightBundle, index: number): string {
  const leg = item.legs?.[0];
  if (leg) return `${leg.airline_code}${leg.flight_number}-${item.price}-${index}`;
  return `bundle-${index}`;
}

function bundleSummary(item: FlightBundle) {
  const firstLeg = item.legs?.[0];
  const lastLeg = item.legs?.[item.legs.length - 1];
  const origin = firstLeg?.departure_airport.code ?? "";
  const dest = lastLeg?.arrival_airport.code ?? "";
  const airline = firstLeg?.airline ?? item.provider ?? "";
  const flightNum = firstLeg ? `${firstLeg.airline_code}${firstLeg.flight_number}` : "";
  const title = [airline, flightNum].filter(Boolean).join(" ");
  const stopStr = item.stops === 0 ? "Nonstop" : `${item.stops} stop${item.stops === 1 ? "" : "s"}`;
  const h = Math.floor(item.duration / 60);
  const m = item.duration % 60;
  const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return {
    title,
    subtitle: [origin && dest ? `${origin} → ${dest}` : "", stopStr].filter(Boolean).join(" · "),
    detail: durStr + (item.self_connect ? " · ⚠ self-connect" : ""),
    price: formatMoney(item.price, item.currency),
  };
}

function bundleLabel(item: FlightBundle): string {
  const firstLeg = item.legs?.[0];
  const lastLeg = item.legs?.[item.legs?.length - 1];
  const airline = firstLeg?.airline ?? item.provider ?? "";
  const flightNum = firstLeg ? `${firstLeg.airline_code}${firstLeg.flight_number}` : "";
  const origin = firstLeg?.departure_airport.code ?? "";
  const dest = lastLeg?.arrival_airport.code ?? "";
  return `Flight bundle: ${airline} ${flightNum} ${origin}→${dest} @ ${item.price} ${item.currency}`;
}

export function PlanFlightBundleToolCall({
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
      extractItems={extractBundles}
      itemKey={bundleKey}
      itemSummary={bundleSummary}
      selectionLabel={bundleLabel}
    />
  );
}
