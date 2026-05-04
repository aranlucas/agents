"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Hotel {
  name: string;
  hotel_id: string;
  rating?: number;
  stars?: number;
  price: number;
  currency: string;
  address?: string;
  neighborhood?: string;
  distance_km?: number;
}

function extractHotels(result: unknown): Hotel[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.hotels) ? (record.hotels as Hotel[]) : [];
}

function hotelKey(item: Hotel, index: number): string {
  return item.hotel_id ?? `hotel-${index}`;
}

function hotelSummary(item: Hotel) {
  const starStr = item.stars ? `${"★".repeat(item.stars)}` : "";
  const location = item.neighborhood ?? item.address ?? "";
  const subtitle = [starStr, location].filter(Boolean).join(" · ");
  const ratingStr = item.rating != null ? `Rating ${item.rating}` : "";
  const distStr = item.distance_km != null ? `${item.distance_km}km away` : "";
  const detail = [ratingStr, distStr].filter(Boolean).join(" · ");

  return {
    title: item.name,
    subtitle: subtitle || undefined,
    detail: detail || undefined,
    price: formatMoney(item.price, item.currency),
  };
}

function hotelLabel(item: Hotel): string {
  return `Hotel match: ${item.name} (${item.hotel_id}) @ ${item.price} ${item.currency}`;
}

export function SearchHotelByNameToolCall({
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
      extractItems={extractHotels}
      itemKey={hotelKey}
      itemSummary={hotelSummary}
      selectionLabel={hotelLabel}
    />
  );
}
