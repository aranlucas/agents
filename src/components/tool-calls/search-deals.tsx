"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Deal {
  title: string;
  price?: number;
  currency?: string;
  origin?: string;
  destination?: string;
  airline?: string;
  date_range?: string;
  type: string;
  source: string;
  url: string;
  summary?: string;
}

function extractDeals(result: unknown): Deal[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.deals) ? (record.deals as Deal[]) : [];
}

function dealKey(item: Deal, index: number): string {
  return item.url ? `deal-${item.url}` : `deal-${index}`;
}

function dealSummary(item: Deal) {
  const route =
    item.origin && item.destination ? `${item.origin} → ${item.destination}` : undefined;
  const subtitle = route ?? item.type;
  const detail = [item.airline, item.date_range, item.source ? `via ${item.source}` : ""]
    .filter(Boolean)
    .join(" · ");

  return {
    title: item.title,
    subtitle,
    detail: detail || undefined,
    price:
      item.price != null
        ? formatMoney(item.price, item.currency ?? "")
        : undefined,
  };
}

function dealLabel(item: Deal): string {
  return `Deal: ${item.title} (${item.source})`;
}

export function SearchDealsToolCall({
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
      extractItems={extractDeals}
      itemKey={dealKey}
      itemSummary={dealSummary}
      selectionLabel={dealLabel}
    />
  );
}
