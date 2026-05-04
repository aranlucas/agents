"use client";

import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface Restaurant {
  name: string;
  rating: number;
  category: string;
  cuisine?: string;
  price_level: number;
  distance_m: number;
  address: string;
  tip?: string;
}

function extractRestaurants(result: unknown): Restaurant[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.restaurants) ? (record.restaurants as Restaurant[]) : [];
}

function restaurantKey(item: Restaurant, index: number): string {
  return `${item.name}-${item.address}-${index}`;
}

function restaurantSummary(item: Restaurant) {
  const cuisine = item.cuisine ?? item.category;
  const dollars = "$".repeat(Math.min(item.price_level, 5));
  const detail = [`Rating ${item.rating}`, `${item.distance_m}m`, item.tip]
    .filter(Boolean)
    .join(" · ");

  return {
    title: item.name,
    subtitle: `${cuisine} · ${dollars}`,
    detail: detail || undefined,
  };
}

function restaurantLabel(item: Restaurant): string {
  return `Restaurant: ${item.name} (${item.cuisine ?? item.category})`;
}

export function SearchRestaurantsToolCall({
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
      extractItems={extractRestaurants}
      itemKey={restaurantKey}
      itemSummary={restaurantSummary}
      selectionLabel={restaurantLabel}
    />
  );
}
