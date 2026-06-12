"use client";

import React, { useMemo } from "react";
import { Streamdown } from "streamdown";
import type { DocStatus } from "@agents/types";

import { Badge } from "@agents/ui";
import { Button } from "@agents/ui";
import { Card, CardContent, CardFooter, CardHeader } from "@agents/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Day {
  day: number;
  theme: string;
  activities: string[];
}

interface Props {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetUsd: number;
  headline: string;
  summary: string;
  itinerary: string;
  flights: string;
  status: DocStatus;
  isStreaming: boolean;
  reviewSummary?: string;
  onDestinationChange: (next: string) => void;
  onHeadlineChange: (next: string) => void;
  onItineraryChange: (next: string) => void;
  onReset: () => void;
}

const STATUS_META: Record<DocStatus, { label: string; dotClass: string; chipClass: string }> = {
  idle: {
    label: "No trip yet",
    dotClass: "bg-muted-foreground",
    chipClass: "text-(--ink-soft) bg-muted",
  },
  drafting: {
    label: "Drafting",
    dotClass: "bg-primary animate-pulse",
    chipClass: "text-accent-foreground bg-accent",
  },
  ready_to_book: {
    label: "Ready to book",
    dotClass: "bg-(--warning)",
    chipClass: "text-(--warning) bg-[color-mix(in_srgb,var(--warning)_14%,transparent)]",
  },
  booked: {
    label: "Booked",
    dotClass: "bg-(--success)",
    chipClass:
      "text-(--success) bg-(--success-soft) dark:bg-[color-mix(in_srgb,var(--success)_16%,transparent)]",
  },
};

function parseItinerary(raw: string): {
  days: Day[];
  trailing: string;
} {
  if (!raw.trim()) return { days: [], trailing: "" };
  const lines = raw.split("\n");
  const days: Day[] = [];
  let current: Day | null = null;
  let preamble: string[] = [];

  const dayRe = /^##\s*Day\s+(\d+)\s*[:\-–—]\s*(.*)$/i;
  const bulletRe = /^\s*[-*•]\s*(.*)$/;

  for (const line of lines) {
    const dayMatch = line.match(dayRe);
    if (dayMatch) {
      if (current) days.push(current);
      current = {
        day: Number(dayMatch[1]),
        theme: dayMatch[2].trim(),
        activities: [],
      };
      continue;
    }
    if (current) {
      const b = line.match(bulletRe);
      if (b) {
        current.activities.push(b[1].trim());
      } else if (line.trim()) {
        // Treat any non-bullet content as a continuation of the last bullet
        // or a free-form line.
        current.activities.push(line.trim());
      }
    } else if (line.trim()) {
      preamble.push(line.trim());
    }
  }
  if (current) days.push(current);
  return { days, trailing: preamble.join(" ") };
}

function fmtDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  const a = fmtDate(start);
  const b = fmtDate(end);
  if (a && b) return `${a} → ${b}`;
  return a || b;
}

function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

export function DocumentCanvas({
  destination,
  startDate,
  endDate,
  travelers,
  budgetUsd,
  headline,
  summary,
  itinerary,
  flights,
  status,
  isStreaming,
  reviewSummary,
  onDestinationChange,
  onHeadlineChange,
  onItineraryChange,
  onReset,
}: Props) {
  const meta = STATUS_META[status];
  const { days, trailing } = useMemo(() => parseItinerary(itinerary), [itinerary]);
  const tripLength = daysBetween(startDate, endDate);
  const dateRange = fmtDateRange(startDate, endDate);
  const budgetLabel = budgetUsd > 0 ? `$${budgetUsd.toLocaleString()}` : "—";

  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="from-card to-secondary border-b border-(--border-soft) bg-gradient-to-br px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Input
              type="text"
              value={destination}
              onChange={(e) => onDestinationChange(e.target.value)}
              placeholder="Where to?"
              className="h-auto border-0 bg-transparent px-0 py-0 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-2xl"
            />
            <Input
              type="text"
              value={headline}
              onChange={(e) => onHeadlineChange(e.target.value)}
              placeholder="A one-line vibe (e.g. 'Snow, sushi, onsen')"
              className="mt-1 h-auto border-0 bg-transparent px-0 py-0 text-sm text-(--ink-soft) italic shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" onClick={onReset} variant="outline" size="xs">
              Reset
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <Stat label="Dates" value={dateRange || "—"} />
          <Stat
            label="Length"
            value={tripLength > 0 ? `${tripLength} day${tripLength === 1 ? "" : "s"}` : "—"}
          />
          <Stat label="Travelers" value={travelers > 0 ? String(travelers) : "—"} />
          <Stat label="Budget" value={budgetLabel} />
        </div>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={cn("gap-1.5 border-transparent", meta.chipClass)}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
            {meta.label}
          </Badge>
          {days.length > 0 && (
            <>
              <span>·</span>
              <span>
                {days.length} day{days.length === 1 ? "" : "s"} planned
              </span>
            </>
          )}
          {isStreaming && (
            <>
              <span>·</span>
              <span className="text-accent-foreground font-medium">agent writing</span>
            </>
          )}
        </div>
      </CardHeader>

      {summary && (
        <div className="mx-6 mt-4 text-sm leading-relaxed text-(--ink-soft)">{summary}</div>
      )}

      {flights && (
        <Card size="sm" className="bg-secondary mx-6 mt-4 gap-2 p-4 py-4">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
            Flights
          </h3>
          <div className="text-foreground text-sm">
            <Streamdown>{flights}</Streamdown>
          </div>
        </Card>
      )}

      {status === "ready_to_book" && reviewSummary && (
        <Card className="mx-6 mt-4 gap-0 border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-3 text-xs text-(--ink-soft)">
          <span className="font-semibold text-(--warning)">Agent says:</span> {reviewSummary}
        </Card>
      )}

      <CardContent className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {days.length === 0 && !trailing && !itinerary.trim() ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {trailing && <p className="text-muted-foreground text-sm italic">{trailing}</p>}
            <div className="streamdown-markdown">
              <Streamdown>{itinerary}</Streamdown>
            </div>
            {days.map((d) => (
              <DayCard key={`${d.day}-${d.theme}`} day={d} />
            ))}
            {isStreaming && (
              <Card className="border-primary bg-accent text-accent-foreground gap-0 border-dashed px-4 py-3 text-xs font-medium">
                <span className="inline-flex items-center gap-2">
                  <span className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
                  Streaming next day…
                </span>
              </Card>
            )}
          </div>
        )}

        {isStreaming && (
          <Badge className="bg-accent text-accent-foreground pointer-events-none absolute top-5 right-6 gap-2 font-mono text-[10px] tracking-wider uppercase">
            <span className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
            Live
          </Badge>
        )}
      </CardContent>

      <CardFooter className="bg-secondary border-t border-(--border-soft) px-6 py-3">
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer select-none hover:text-(--ink-soft)">
            Edit raw itinerary (markdown)
          </summary>
          <Textarea
            value={itinerary}
            onChange={(e) => onItineraryChange(e.target.value)}
            placeholder={
              "## Day 1: Arrival\n\n- 14:00 — Land at HND\n- 18:00 — Ramen in Shinjuku\n"
            }
            spellCheck={false}
            rows={8}
            className="bg-card mt-2 resize-y font-mono text-[12px] leading-5"
          />
        </details>
      </CardFooter>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="gap-0 border-(--border-soft) px-3 py-2">
      <div className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
        {label}
      </div>
      <div className="text-foreground mt-0.5 truncate text-sm font-medium">{value}</div>
    </Card>
  );
}

function DayCard({ day }: { day: Day }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="bg-secondary flex-row items-center gap-3 border-b border-(--border-soft) px-4 py-3">
        <div className="bg-accent text-accent-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold">
          {day.day}
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
            Day {day.day}
          </div>
          <div className="text-foreground truncate text-sm font-semibold">
            {day.theme || "Untitled day"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3">
        <ul className="space-y-1.5">
          {day.activities.length === 0 ? (
            <li className="text-muted-foreground text-xs italic">
              (empty — ask the agent to fill this day)
            </li>
          ) : (
            day.activities.map((act) => <ActivityRow key={act} text={act} />)
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function ActivityRow({ text }: { text: string }) {
  // Matches "HH:MM — ..." or "HH:MM - ..." prefix.
  const m = text.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(.+)$/);
  if (m) {
    return (
      <li className="flex items-baseline gap-3 text-sm">
        <span className="bg-accent text-accent-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]">
          {m[1]}
        </span>
        <span className="text-foreground leading-relaxed">{m[2]}</span>
      </li>
    );
  }
  return <li className="text-foreground pl-1 text-sm leading-relaxed">• {text}</li>;
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex h-full min-h-50 flex-col items-center justify-center text-center">
      <div className="bg-accent mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-foreground h-6 w-6"
        >
          <path d="M3 6 9 4l6 2 6-2v14l-6 2-6-2-6 2Z" />
          <path d="M9 4v16" />
          <path d="M15 6v16" />
        </svg>
      </div>
      <p className="text-sm font-medium text-(--ink-soft)">No itinerary yet</p>
      <p className="mt-1 max-w-xs text-xs">
        Ask the agent to plan a trip, or click a suggestion in the chat panel.
      </p>
    </div>
  );
}
