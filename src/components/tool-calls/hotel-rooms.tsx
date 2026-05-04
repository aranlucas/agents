"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Room {
  name: string;
  price: number;
  currency: string;
  provider?: string;
  max_guests?: number;
  bed_type?: string;
  size_m2?: number;
  amenities?: string[];
}

function extractRooms(result: unknown): Room[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.rooms) ? (record.rooms as Room[]) : [];
}

function roomKey(item: Room, index: number): string {
  return `${item.provider ?? ""}-${item.name}-${index}`;
}

function roomSummary(item: Room) {
  const bedStr = item.bed_type ?? "";
  const guestStr = item.max_guests != null ? `sleeps ${item.max_guests}` : "";
  const subtitle = [bedStr, guestStr].filter(Boolean).join(" · ");
  const sizeStr = item.size_m2 != null ? `${item.size_m2}m²` : "";
  const amenities = item.amenities?.slice(0, 2).join(", ") ?? "";
  const detail = [sizeStr, amenities].filter(Boolean).join(" · ");

  return {
    title: item.name,
    subtitle: subtitle || undefined,
    detail: detail || undefined,
    price: formatMoney(item.price, item.currency),
  };
}

function roomLabel(item: Room, result: unknown): string {
  const record = toRecord(result);
  const hotelName = typeof record?.name === "string" ? record.name : "Hotel";
  return `${hotelName} — ${item.name} @ ${item.price} ${item.currency}`;
}

export function HotelRoomsToolCall({
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
      extractItems={extractRooms}
      itemKey={roomKey}
      itemSummary={roomSummary}
      selectionLabel={(item) => roomLabel(item, result)}
    />
  );
}
