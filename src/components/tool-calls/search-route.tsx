"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface RouteLeg {
  mode: string;
  provider: string;
  from: string;
  to: string;
  duration: number;
  price: number;
  currency: string;
  transfers: number;
}

interface Itinerary {
  legs?: RouteLeg[];
  total_price: number;
  currency: string;
  total_duration: number;
  transfers: number;
  depart_time: string;
  arrive_time: string;
}

function extractItineraries(result: unknown): Itinerary[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.itineraries) ? (record.itineraries as Itinerary[]) : [];
}

function itineraryKey(item: Itinerary, index: number): string {
  const dep = item.legs?.[0]?.from ?? "";
  return `${dep}-${item.total_price}-${index}`;
}

function itinerarySummary(item: Itinerary, args: unknown) {
  const record = toRecord(args);
  const origin = typeof record?.origin === "string" ? record.origin : item.legs?.[0]?.from ?? "";
  const dest = typeof record?.destination === "string" ? record.destination : item.legs?.[item.legs?.length - 1]?.to ?? "";
  const modes = item.legs?.map((l) => l.mode).join(" + ") ?? "";
  const transferStr = item.transfers === 0 ? "Direct" : `${item.transfers} transfer${item.transfers === 1 ? "" : "s"}`;
  const h = Math.floor(item.total_duration / 60);
  const m = item.total_duration % 60;
  const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return {
    title: origin && dest ? `${origin} → ${dest}` : modes || "Route",
    subtitle: [transferStr, modes].filter(Boolean).join(" · "),
    detail: `${durStr} · depart ${item.depart_time}`,
    price: formatMoney(item.total_price, item.currency),
  };
}

function itineraryLabel(item: Itinerary, args: unknown): string {
  const record = toRecord(args);
  const origin = typeof record?.origin === "string" ? record.origin : "";
  const dest = typeof record?.destination === "string" ? record.destination : "";
  const modes = item.legs?.map((l) => l.mode).join("+") ?? "";
  return `${origin}→${dest} via ${modes} @ ${item.total_price} ${item.currency}`;
}

export function SearchRouteToolCall({
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
      extractItems={extractItineraries}
      itemKey={itineraryKey}
      itemSummary={(item) => itinerarySummary(item, args)}
      selectionLabel={(item) => itineraryLabel(item, args)}
    />
  );
}
