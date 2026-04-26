"use client";

import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, MessageRole } from "@copilotkit/runtime-client-gql";
import { AgentState, StoredFlightResult, StoredDateResult, DatePrice } from "@/lib/types";
import { deriveArcs } from "@/lib/arcs";
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

function mergeAndSort(state: AgentState): ResultEntry[] {
  const flights: ResultEntry[] = (state.flight_results ?? []).map((r) => ({
    kind: "flight",
    data: r,
  }));
  const dates: ResultEntry[] = (state.date_results ?? []).map((r) => ({
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
  const entries = mergeAndSort(state);
  const arcs = deriveArcs(state);
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
