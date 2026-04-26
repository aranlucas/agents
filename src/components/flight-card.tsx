"use client";

import { Flight } from "@/lib/types";

function formatTime(datetime: string): string {
  if (!datetime) return "--:--";
  try {
    const d = new Date(datetime);
    if (isNaN(d.getTime())) {
      const match = datetime.match(/\d{2}:\d{2}/);
      return match ? match[0] : datetime.slice(0, 5);
    }
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return datetime.slice(0, 5);
  }
}

function formatDuration(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function PlaneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-4 h-4"
      style={{ color: "var(--amber)" }}
    >
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

export function FlightCard({
  flight,
  index,
  isCheapest,
  originCode,
  destCode,
}: {
  flight: Flight;
  index: number;
  isCheapest?: boolean;
  originCode?: string;
  destCode?: string;
}) {
  const leg = flight.legs?.[0];
  if (!leg) return null;

  const depTime = formatTime(leg.departure_datetime);
  const arrTime = formatTime(leg.arrival_datetime);
  const duration = formatDuration(flight.duration_min);
  const stops = flight.stops ?? Math.max(0, (flight.legs?.length ?? 1) - 1);
  const stopsLabel =
    stops === 0
      ? "DIRECT"
      : `${stops} STOP${stops > 1 ? "S" : ""}`;
  const stopsColor =
    stops === 0
      ? "var(--green)"
      : stops === 1
      ? "var(--amber)"
      : "var(--red)";

  return (
    <div
      className="animate-boarding-pass"
      style={{
        animationDelay: `${index * 70}ms`,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Cheapest badge */}
      {isCheapest && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            background: "var(--green)",
            color: "#07080a",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            padding: "0.2rem 0.6rem",
            borderBottomRightRadius: "0.4rem",
            fontFamily: "var(--font-mono)",
          }}
        >
          BEST PRICE
        </div>
      )}

      {/* Header row: stops + price */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
          marginTop: isCheapest ? "0.6rem" : 0,
        }}
      >
        <span
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.15em",
            color: stopsColor,
            fontFamily: "var(--font-mono)",
          }}
        >
          ◉ {stopsLabel}
        </span>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2rem",
              fontWeight: 600,
              lineHeight: 1,
              color: "var(--amber-bright)",
            }}
          >
            ${flight.price}
          </div>
          <div
            style={{
              fontSize: "0.6rem",
              color: "var(--cream-muted)",
              letterSpacing: "0.1em",
              marginTop: "0.1rem",
            }}
          >
            PER PERSON
          </div>
        </div>
      </div>

      {/* Route row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.1rem",
        }}
      >
        {/* Departure */}
        <div style={{ minWidth: "4rem" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "1.75rem",
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--cream)",
              letterSpacing: "-0.02em",
            }}
          >
            {originCode ?? leg.departure_airport}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.9rem",
              color: "var(--amber)",
              marginTop: "0.15rem",
            }}
          >
            {depTime}
          </div>
        </div>

        {/* Route line */}
        <div
          className="route-line"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              position: "relative",
              height: "1.5rem",
            }}
          >
            {/* Left dot */}
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--amber-dim)",
                flexShrink: 0,
                zIndex: 1,
              }}
            />
            {/* Line */}
            <div
              style={{
                flex: 1,
                height: "1px",
                background:
                  "linear-gradient(90deg, var(--amber-dim), var(--amber), var(--amber-dim))",
              }}
            />
            {/* Plane */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg-card)",
                padding: "0 0.2rem",
                zIndex: 1,
              }}
            >
              <PlaneIcon />
            </div>
            {/* Right dot */}
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--amber-dim)",
                flexShrink: 0,
                zIndex: 1,
              }}
            />
          </div>
          {/* Duration label */}
          {duration && (
            <div
              style={{
                fontSize: "0.6rem",
                color: "var(--cream-muted)",
                letterSpacing: "0.1em",
                fontFamily: "var(--font-mono)",
              }}
            >
              {duration}
            </div>
          )}
        </div>

        {/* Arrival */}
        <div style={{ minWidth: "4rem", textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "1.75rem",
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--cream)",
              letterSpacing: "-0.02em",
            }}
          >
            {destCode ?? leg.arrival_airport}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.9rem",
              color: "var(--amber)",
              marginTop: "0.15rem",
            }}
          >
            {arrTime}
          </div>
        </div>
      </div>

      {/* Perforation */}
      <div className="perforation" style={{ marginBottom: "1rem" }} />

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.95rem",
              color: "var(--cream)",
              letterSpacing: "0.02em",
            }}
          >
            {leg.airline}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--cream-muted)",
              letterSpacing: "0.08em",
              marginTop: "0.1rem",
            }}
          >
            {leg.flight_number}
          </div>
        </div>

        {/* Multi-stop legs indicator */}
        {flight.legs.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "0.35rem",
              alignItems: "center",
            }}
          >
            {flight.legs.slice(1).map((l, i) => (
              <span
                key={i}
                style={{
                  fontSize: "0.6rem",
                  color: "var(--cream-muted)",
                  fontFamily: "var(--font-mono)",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.2rem",
                  padding: "0.1rem 0.3rem",
                  letterSpacing: "0.08em",
                }}
              >
                via {l.departure_airport}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FlightCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="animate-boarding-pass"
      style={{
        animationDelay: `${index * 70}ms`,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
      }}
    >
      <div
        className="loading-shimmer"
        style={{ height: "1rem", width: "30%", borderRadius: "0.25rem", marginBottom: "1rem" }}
      />
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.1rem", alignItems: "center" }}>
        <div className="loading-shimmer" style={{ height: "2.5rem", width: "4rem", borderRadius: "0.25rem" }} />
        <div className="loading-shimmer" style={{ flex: 1, height: "1px" }} />
        <div className="loading-shimmer" style={{ height: "2.5rem", width: "4rem", borderRadius: "0.25rem" }} />
      </div>
      <div className="perforation" style={{ marginBottom: "1rem" }} />
      <div className="loading-shimmer" style={{ height: "0.8rem", width: "40%", borderRadius: "0.25rem" }} />
    </div>
  );
}
