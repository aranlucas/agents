"use client";

import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface LocalEvent {
  name: string;
  date: string;
  time?: string;
  venue: string;
  type: string;
  url?: string;
  price_range?: string;
}

function extractEvents(result: unknown): LocalEvent[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.events) ? (record.events as LocalEvent[]) : [];
}

function eventKey(item: LocalEvent, index: number): string {
  return `${item.name}-${item.date}-${index}`;
}

function eventSummary(item: LocalEvent) {
  const dateStr = item.time ? `${item.date} ${item.time}` : item.date;
  const detail = [item.type, item.price_range].filter(Boolean).join(" · ");

  return {
    title: item.name,
    subtitle: `${dateStr} · ${item.venue}`,
    detail: detail || undefined,
  };
}

function eventLabel(item: LocalEvent): string {
  return `Event: ${item.name} on ${item.date} at ${item.venue}`;
}

export function LocalEventsToolCall({
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
      extractItems={extractEvents}
      itemKey={eventKey}
      itemSummary={eventSummary}
      selectionLabel={eventLabel}
    />
  );
}
