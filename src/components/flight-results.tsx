"use client";

import { FlightCard, FlightCardSkeleton } from "./flight-card";
import { FlightSearchResult } from "@/lib/types";

export function FlightResults({
  args,
  result,
}: {
  args: Record<string, string>;
  result?: FlightSearchResult | string;
}) {
  const from = args?.departure_airport ?? args?.from ?? "???";
  const to = args?.arrival_airport ?? args?.to ?? "???";
  const date = args?.date ?? args?.travel_date ?? "";

  const parsed: FlightSearchResult | null =
    result == null
      ? null
      : typeof result === "string"
        ? tryParse(result)
        : result;

  const flights = parsed?.flights ?? [];
  const isLoading = result == null;
  const hasError = parsed?.error;

  const cheapestPrice = flights.length
    ? Math.min(...flights.map((f) => f.price))
    : null;

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Route header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.6rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "var(--cream)",
          }}
        >
          {from}
        </div>
        <div style={{ color: "var(--amber)", fontSize: "1rem" }}>→</div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.6rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "var(--cream)",
          }}
        >
          {to}
        </div>
        {date && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--cream-muted)",
              letterSpacing: "0.08em",
              marginLeft: "auto",
            }}
          >
            {date}
          </div>
        )}
      </div>

      {/* Error state */}
      {hasError && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--red)",
            borderRadius: "0.5rem",
            padding: "1rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--red)",
          }}
        >
          {parsed?.error}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {[0, 1, 2].map((i) => (
            <FlightCardSkeleton key={i} index={i} />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && !hasError && flights.length === 0 && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1.25rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--cream-muted)",
            textAlign: "center",
            letterSpacing: "0.08em",
          }}
        >
          NO FLIGHTS FOUND
        </div>
      )}

      {flights.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {flights.map((flight, i) => (
            <FlightCard
              key={i}
              flight={flight}
              index={i}
              isCheapest={flight.price === cheapestPrice && i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function tryParse(s: string): FlightSearchResult {
  try {
    return JSON.parse(s);
  } catch {
    return { error: s };
  }
}
