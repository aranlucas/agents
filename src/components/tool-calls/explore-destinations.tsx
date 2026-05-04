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
  return item.city_id;
}

function destSummary(item: Destination) {
  const name = [item.city_name ?? item.city_id, item.country].filter(Boolean).join(", ");
  const subtitle = [item.airport_code, item.airline_name].filter(Boolean).join(" · ");
  const stopStr = item.stops === 0 ? "Nonstop" : `${item.stops} stop${item.stops === 1 ? "" : "s"}`;

  return {
    title: name,
    subtitle: subtitle || undefined,
    detail: stopStr,
    price: formatMoney(item.price, "USD"),
  };
}

function destLabel(item: Destination): string {
  return `Destination: ${item.city_name ?? item.city_id} (${item.airport_code})`;
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
