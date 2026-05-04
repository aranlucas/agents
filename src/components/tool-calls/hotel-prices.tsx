"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface HotelProvider {
  provider: string;
  price: number;
  currency: string;
}

function extractProviders(result: unknown): HotelProvider[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.providers) ? (record.providers as HotelProvider[]) : [];
}

function providerKey(item: HotelProvider): string {
  return item.provider;
}

function providerSummary(item: HotelProvider) {
  return {
    title: item.provider,
    price: formatMoney(item.price, item.currency),
  };
}

function providerLabel(item: HotelProvider, result: unknown): string {
  const record = toRecord(result);
  const hotelName = typeof record?.name === "string" ? record.name : "Hotel";
  return `${hotelName} via ${item.provider} @ ${item.price} ${item.currency}`;
}

export function HotelPricesToolCall({
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
      extractItems={extractProviders}
      itemKey={(item) => providerKey(item)}
      itemSummary={providerSummary}
      selectionLabel={(item) => providerLabel(item, result)}
    />
  );
}
