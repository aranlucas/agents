"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface TransferLocation {
  city: string;
  station?: string;
  time: string;
}

interface TransferRoute {
  provider: string;
  type: string;
  price: number;
  currency: string;
  duration_minutes: number;
  departure: TransferLocation;
  arrival: TransferLocation;
  transfers: number;
}

function extractRoutes(result: unknown): TransferRoute[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.routes) ? (record.routes as TransferRoute[]) : [];
}

function routeKey(item: TransferRoute, index: number): string {
  return `${item.provider}-${item.departure.time ?? ""}-${index}`;
}

function routeSummary(item: TransferRoute) {
  const h = Math.floor(item.duration_minutes / 60);
  const m = item.duration_minutes % 60;
  const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const transferStr = item.transfers === 0 ? "Direct" : `${item.transfers} transfer${item.transfers === 1 ? "" : "s"}`;

  return {
    title: `${item.provider} (${item.type})`,
    subtitle: `${item.departure.city} → ${item.arrival.city}`,
    detail: `${durStr} · ${transferStr}`,
    price: formatMoney(item.price, item.currency),
  };
}

function routeLabel(item: TransferRoute): string {
  return `Transfer: ${item.provider} ${item.departure.city}→${item.arrival.city} @ ${item.price} ${item.currency}`;
}

export function SearchAirportTransfersToolCall({
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
      extractItems={extractRoutes}
      itemKey={routeKey}
      itemSummary={routeSummary}
      selectionLabel={routeLabel}
    />
  );
}
