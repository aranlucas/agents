"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Getaway {
  destination: string;
  airport_code: string;
  flight_price: number;
  hotel_price: number;
  hotel_name?: string;
  total: number;
  currency: string;
  stops: number;
  airline_name?: string;
}

function extractGetaways(result: unknown): Getaway[] {
  const record = toRecord(result);
  if (!record) return [];
  const inner = toRecord(record.result) ?? record;
  return Array.isArray(inner.destinations) ? (inner.destinations as Getaway[]) : [];
}

function getawayKey(item: Getaway): string {
  return item.airport_code;
}

function getawaySummary(item: Getaway) {
  const airline = item.airline_name ?? "";
  const stopStr = item.stops === 0 ? "Nonstop" : `${item.stops} stop${item.stops === 1 ? "" : "s"}`;
  const subtitle = [item.airport_code, airline, stopStr].filter(Boolean).join(" · ");
  const hotelStr = item.hotel_name
    ? `Flight ${item.flight_price} + ${item.hotel_name} ${item.hotel_price}`
    : `Flight ${item.flight_price} + Hotel ${item.hotel_price}`;

  return {
    title: item.destination,
    subtitle,
    detail: hotelStr,
    price: formatMoney(item.total, item.currency),
  };
}

function getawayLabel(item: Getaway): string {
  return `Getaway: ${item.destination} (${item.airport_code}) — total ${item.total} ${item.currency}`;
}

export function WeekendGetawayToolCall({
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
      extractItems={extractGetaways}
      itemKey={getawayKey}
      itemSummary={getawaySummary}
      selectionLabel={getawayLabel}
    />
  );
}
