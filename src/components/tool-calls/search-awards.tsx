"use client";

import { toRecord } from "../mcp-tool-call/payload";
import { SelectableListToolCall } from "./selectable-list-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface AwardSeat {
  Program: string;
  Origin: string;
  Destination: string;
  Date: string;
  Cabin: string;
  MilesCost: number;
  CashFees: number;
  CashEquivalent: number;
  BookableSegments: number;
}

interface SweetSpot {
  Seat: AwardSeat;
  BookingProgram: string;
  SourceProgram: string;
  TransferRoute: string;
  MilesSpentNative: number;
  MilesSpentSource: number;
  CashFees: number;
  CashEquivalent: number;
  CentsPerPoint: number;
  Affordable: boolean;
  Reason: string;
}

function extractSweetSpots(result: unknown): SweetSpot[] {
  const record = toRecord(result);
  if (!record) return [];
  return Array.isArray(record.sweet_spots) ? (record.sweet_spots as SweetSpot[]) : [];
}

function awardKey(item: SweetSpot, index: number): string {
  return `${item.BookingProgram}-${item.Seat.Origin}-${item.Seat.Destination}-${item.Seat.Date}-${index}`;
}

function awardSummary(item: SweetSpot) {
  const miles = item.MilesSpentNative.toLocaleString();
  const cpp = item.CentsPerPoint.toFixed(1);
  const detail = [
    `${miles} mi + ${item.CashFees} fees`,
    `${cpp}¢/pt`,
    item.Affordable ? "Affordable ✓" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `${item.BookingProgram} ${item.Seat.Cabin}`,
    subtitle: `${item.Seat.Origin} → ${item.Seat.Destination} · ${item.Seat.Date}`,
    detail,
  };
}

function awardLabel(item: SweetSpot): string {
  return `${item.BookingProgram} ${item.Seat.Cabin} ${item.Seat.Origin}→${item.Seat.Destination} @ ${item.MilesSpentNative.toLocaleString()} mi`;
}

export function SearchAwardsToolCall({
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
      extractItems={extractSweetSpots}
      itemKey={awardKey}
      itemSummary={awardSummary}
      selectionLabel={awardLabel}
    />
  );
}
