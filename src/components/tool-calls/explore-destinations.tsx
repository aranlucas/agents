"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Destination {
  city_id: string;
  city_name?: string;
  country?: string;
  airport_code: string;
  price: number;
  airline_name?: string;
  airline_code?: string;
  stops: number;
}

function extractDestinations(result: unknown): Destination[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.destinations) ? (record.destinations as Destination[]) : [];
}

function destKey(item: Destination): string {
  return item.airport_code || item.city_id;
}

function destSummary(item: Destination) {
  const title = item.city_name
    ? [item.city_name, item.country].filter(Boolean).join(", ")
    : item.airport_code
      ? `Airport ${item.airport_code}`
      : "Destination option";
  const subtitle = [item.airline_name, item.airline_code].filter(Boolean).join(" · ");
  const stopStr = item.stops === 0 ? "Nonstop" : `${item.stops} stop${item.stops === 1 ? "" : "s"}`;

  return {
    title,
    subtitle: subtitle || undefined,
    detail: stopStr,
    price: formatMoney(item.price, "USD"),
  };
}

function destLabel(item: Destination): string {
  const visibleName = item.city_name ?? item.airport_code ?? "destination option";
  return `Destination: ${visibleName}${item.airline_name ? ` via ${item.airline_name}` : ""}`;
}

export function ExploreDestinationsToolCall({
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
      extractItems={extractDestinations}
      itemKey={destKey}
      itemSummary={destSummary}
      selectionLabel={destLabel}
    />
  );
}
