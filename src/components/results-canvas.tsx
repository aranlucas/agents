"use client";

import { useMemo } from "react";
import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, MessageRole } from "@copilotkit/runtime-client-gql";
import { AgentState, StoredFlightResult, StoredDateResult, DatePrice } from "@/lib/types";
import { deriveArcsFromResults } from "@/lib/arcs";
import { getDateResults, getFlightResults } from "@/lib/state";
import { GlobeCanvas } from "./globe-canvas";
import { FlightCard } from "./flight-card";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(dates: string[]): string {
  if (!dates.length) return "";
  if (dates.length === 1) return fmtDate(dates[0]);
  const d0 = new Date(dates[0]);
  const d1 = new Date(dates[1]);
  const month = d0.toLocaleDateString("en-US", { month: "short" });
  if (d0.getMonth() === d1.getMonth()) return `${month} ${d0.getDate()}–${d1.getDate()}`;
  return `${fmtDate(dates[0])} – ${fmtDate(dates[1])}`;
}

type ResultEntry =
  | { kind: "flight"; data: StoredFlightResult }
  | { kind: "date"; data: StoredDateResult };

function mergeAndSort(
  flightsInput: StoredFlightResult[],
  datesInput: StoredDateResult[]
): ResultEntry[] {
  const flights: ResultEntry[] = flightsInput.map((r) => ({
    kind: "flight",
    data: r,
  }));
  const dates: ResultEntry[] = datesInput.map((r) => ({
    kind: "date",
    data: r,
  }));
  return [...flights, ...dates].sort((a, b) => b.data.ts - a.data.ts);
}

function RouteHeader({ args }: { args: Record<string, string> }) {
  const from = args.origin ?? args.departure_airport ?? "SEA";
  const to = args.destination ?? args.arrival_airport ?? "???";
  const date = args.departure_date ?? args.date ?? "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "0.75rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 600,
          color: "var(--cream)",
          letterSpacing: "0.04em",
        }}
      >
        {from}
      </span>
      <span style={{ color: "var(--amber)" }}>→</span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 600,
          color: "var(--cream)",
          letterSpacing: "0.04em",
        }}
      >
        {to}
      </span>
      {date && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.08em",
            marginLeft: "auto",
          }}
        >
          {date}
        </span>
      )}
    </div>
  );
}

function DateCard({ data, isLatest }: { data: StoredDateResult; isLatest: boolean }) {
  const { appendMessage } = useCopilotChat();
  const sorted = [...data.dates].sort((a: DatePrice, b: DatePrice) => a.price - b.price);
  const origin = data.args.origin ?? data.args.departure_airport ?? "SEA";
  const dest = data.args.destination ?? data.args.arrival_airport ?? "?";

  function handleDateClick(d: DatePrice) {
    const isRoundTrip = d.date.length > 1;
    const content = isRoundTrip
      ? `Find round-trip flights from ${origin} to ${dest} departing ${fmtDate(d.date[0])} returning ${fmtDate(d.date[1])}`
      : `Find flights from ${origin} to ${dest} on ${fmtDate(d.date[0])}`;
    appendMessage(new TextMessage({ role: MessageRole.User, content }));
  }

  return (
    <div
      style={{
        background: "rgba(7,8,10,0.82)",
        border: `1px solid ${isLatest ? "var(--amber)" : "var(--border)"}`,
        borderLeft: `2px solid ${isLatest ? "var(--amber)" : "transparent"}`,
        borderRadius: "0.75rem",
        padding: "1.1rem",
        opacity: isLatest ? 1 : 0.5,
      }}
    >
      <RouteHeader args={data.args} />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--cream-muted)",
          letterSpacing: "0.12em",
          marginBottom: "0.75rem",
        }}
      >
        CHEAPEST DATES
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {sorted.slice(0, 6).map((d: DatePrice) => (
          <button
            key={d.date[0]}
            onClick={() => handleDateClick(d)}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              padding: "0.35rem 0.6rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--cream)",
              cursor: "pointer",
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--amber)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span style={{ color: "var(--cream-muted)" }}>{formatDateRange(d.date)}</span>
            <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>${d.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function priceColor(price: number): string {
  if (price < 150) return "#22c55e";
  if (price < 300) return "#f59e0b";
  return "#ef4444";
}

function LeaderboardCard({ state }: { state: AgentState }) {
  const { appendMessage } = useCopilotChat();
  const dateResults = getDateResults(state);

  // Build cheapest-price-per-destination map
  const byDest = new Map<string, { price: number; date: string[]; origin: string }>();
  for (const r of dateResults) {
    const dest = r.args.destination ?? r.args.arrival_airport ?? "";
    const origin = r.args.origin ?? r.args.departure_airport ?? "SEA";
    if (!dest || !r.dates.length) continue;
    const cheapest = r.dates.reduce((a, b) => (a.price < b.price ? a : b));
    const existing = byDest.get(dest);
    if (!existing || cheapest.price < existing.price) {
      byDest.set(dest, { price: cheapest.price, date: cheapest.date, origin });
    }
  }

  if (byDest.size < 2) return null;

  const ranked = [...byDest.entries()].sort((a, b) => a[1].price - b[1].price);

  return (
    <div
      style={{
        background: "rgba(7,8,10,0.9)",
        border: "1px solid var(--amber)",
        borderRadius: "0.75rem",
        padding: "1.1rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--amber)",
          letterSpacing: "0.2em",
          marginBottom: "0.75rem",
        }}
      >
        ✦ WEEKEND DEALS SCAN
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {ranked.map(([dest, info], i) => (
          <button
            key={dest}
            onClick={() =>
              appendMessage(
                new TextMessage({
                  role: MessageRole.User,
                  content: `Find flights from ${info.origin} to ${dest} on ${info.date[0]}`,
                })
              )
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              padding: "0.45rem 0.65rem",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = priceColor(info.price))}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "var(--cream-muted)",
                width: "1rem",
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--cream)",
                letterSpacing: "0.04em",
                flex: 1,
              }}
            >
              {dest}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "var(--cream-muted)",
              }}
            >
              {formatDateRange(info.date)}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 700,
                color: priceColor(info.price),
              }}
            >
              ${info.price}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FlightResultCard({ data, isLatest }: { data: StoredFlightResult; isLatest: boolean }) {
  const { flights } = data;
  const cheapestPrice = flights.length
    ? Math.min(...flights.map((f) => f.price))
    : null;

  return (
    <div
      style={{
        background: "rgba(7,8,10,0.82)",
        border: `1px solid ${isLatest ? "var(--amber)" : "var(--border)"}`,
        borderLeft: `2px solid ${isLatest ? "var(--amber)" : "transparent"}`,
        borderRadius: "0.75rem",
        padding: "1.1rem",
        opacity: isLatest ? 1 : 0.5,
      }}
    >
      <RouteHeader args={data.args} />
      {flights.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.08em",
          }}
        >
          NO FLIGHTS FOUND
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {flights.slice(0, 5).map((flight, i) => (
            <FlightCard
              key={i}
              flight={flight}
              index={i}
              isCheapest={flight.price === cheapestPrice && i === 0}
              originCode={data.args.origin ?? data.args.departure_airport ?? "SEA"}
              destCode={data.args.destination ?? data.args.arrival_airport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultsCanvas({ state }: { state: AgentState }) {
  const flightResults = useMemo(() => getFlightResults(state), [state.flight_results]);
  const dateResults = useMemo(() => getDateResults(state), [state.date_results]);
  const entries = useMemo(() => mergeAndSort(flightResults, dateResults), [flightResults, dateResults]);
  const arcs = useMemo(
    () => deriveArcsFromResults(flightResults, dateResults),
    [flightResults, dateResults]
  );
  const latestTs = entries.length > 0 ? entries[0].data.ts : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <GlobeCanvas arcs={arcs} />
      <div
        style={{
          position: "absolute",
          top: "2rem",
          right: "2rem",
          width: "380px",
          maxHeight: "calc(100vh - 4rem)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <LeaderboardCard state={state} />
        {entries.map((entry) => {
          const isLatest = entry.data.ts === latestTs;
          return entry.kind === "flight" ? (
            <FlightResultCard key={entry.data.id} data={entry.data} isLatest={isLatest} />
          ) : (
            <DateCard key={entry.data.id} data={entry.data} isLatest={isLatest} />
          );
        })}
      </div>
    </div>
  );
}
