"use client";

import { useMemo } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { AgentState, ActiveTrip, TripLeg } from "@/lib/types";
import { getActiveTrip } from "@/lib/state";
import { GlobeCanvas } from "./globe-canvas";
import { CITIES, type CityCoord } from "@/lib/cities";
import type { ArcDatum, PointDatum } from "@/lib/types";

function getCityCoords(city: string): CityCoord | null {
  if (!city) return null;

  // Try exact match first
  if (CITIES[city]) return CITIES[city];

  // Try matching by city name without state/province
  const cityOnly = city.split(",")[0].trim().toLowerCase();
  const match = Object.entries(CITIES).find(
    ([key]) => key.split(",")[0].trim().toLowerCase() === cityOnly,
  );

  if (match) return match[1];

  // Try partial match (e.g., "Vancouver" matches "Vancouver, BC")
  const partialMatch = Object.entries(CITIES).find(
    ([key]) =>
      key.toLowerCase().includes(cityOnly) ||
      cityOnly.includes(key.split(",")[0].trim().toLowerCase()),
  );

  return partialMatch ? partialMatch[1] : null;
}

const OPACITY_CONFIRMED = 0.9;
const OPACITY_PENDING = 0.4;

function tripLegsToArcs(legs: TripLeg[]): ArcDatum[] {
  return legs
    .map((leg, index) => {
      if (leg.type === "hotel") return null;
      const start = getCityCoords(leg.from);
      const end = getCityCoords(leg.to);
      if (!start || !end) return null;

      const isRoadTrip =
        leg.type === "road_trip" || leg.type === "bus" || leg.type === "train";
      const op = leg.confirmed ? OPACITY_CONFIRMED : OPACITY_PENDING;

      const color: [string, string] = isRoadTrip
        ? [`rgba(59,130,246,${op})`, `rgba(99,102,241,${op})`] // blue → indigo
        : [`rgba(245,158,11,${op})`, `rgba(239,68,68,${op})`]; // amber → red

      return {
        id: `leg-${index}`,
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        color,
        strokeWidth: leg.confirmed ? 1.5 : 0.8,
      };
    })
    .filter((arc): arc is ArcDatum => arc !== null);
}

function tripLegsToAirportPoints(legs: TripLeg[]): PointDatum[] {
  const seen = new Set<string>();
  const points: PointDatum[] = [];
  for (const leg of legs) {
    if (leg.type === "hotel") continue;
    for (const city of [leg.from, leg.to]) {
      if (!city || seen.has(city)) continue;
      seen.add(city);
      const coords = getCityCoords(city);
      if (coords) {
        points.push({
          id: city,
          lat: coords.lat,
          lng: coords.lng,
          color: "rgba(255,255,255,0.8)",
          label: city,
        } as PointDatum);
      }
    }
  }
  return points;
}

function CardRenderFallback({ error }: FallbackProps) {
  return (
    <div
      style={{
        background: "rgba(7,8,10,0.9)",
        border: "1px solid var(--red)",
        borderRadius: "0.75rem",
        padding: "1rem",
        color: "var(--cream)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--red)",
          letterSpacing: "0.12em",
          marginBottom: "0.5rem",
        }}
      >
        CARD RENDER ERROR
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--cream-muted)",
          lineHeight: 1.5,
        }}
      >
        {error instanceof Error ? error.message : "Unknown render error"}
      </div>
    </div>
  );
}

function ActiveTripCard({ trip }: { trip: ActiveTrip }) {
  const origin = trip.origin || "???";
  const dest = trip.destination || "???";
  const updatedValue = trip.updated_at ?? trip.source_updated_at;
  const updated =
    typeof updatedValue === "number"
      ? new Date(updatedValue * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : typeof updatedValue === "string"
        ? new Date(updatedValue).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

  const topFlight = trip.transport?.options?.[0];
  const topRoute = trip.transport?.routes?.[0];
  const topHotel = trip.lodging?.options?.[0];
  const viability = trip.viability;
  const legs = trip.legs || [];

  // Compute full route from legs
  const fullRoute = legs.reduce<string[]>((route, leg) => {
    if (route.length === 0) route.push(leg.from);
    if (leg.to && !route.includes(leg.to)) route.push(leg.to);
    return route;
  }, []);
  const displayRoute = fullRoute.length > 0 ? fullRoute : [origin, dest];

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          ACTIVE TRIP{trip.status ? ` · ${trip.status.toUpperCase()}` : ""}
        </span>
        {updated && (
          <span style={{ color: "var(--cream-muted)", fontSize: "0.6rem" }}>
            Updated {updated}
          </span>
        )}
      </div>

      {trip.name && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--cream)",
            marginBottom: "0.5rem",
          }}
        >
          {trip.name}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        {displayRoute.map((loc, i) => (
          <span
            key={i}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--cream)",
              letterSpacing: "0.04em",
            }}
          >
            {loc}
            {i < displayRoute.length - 1 && (
              <span style={{ color: "var(--amber)", margin: "0 0.2rem" }}>
                →
              </span>
            )}
          </span>
        ))}
      </div>

      {trip.id && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--cream-muted)",
            marginBottom: "0.5rem",
          }}
        >
          Trip ID: {trip.id}
        </div>
      )}

      {legs.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: "var(--cream-muted)",
              letterSpacing: "0.1em",
              marginBottom: "0.4rem",
            }}
          >
            TRIP LEGS
          </div>
          {legs.map((leg, index) => (
            <div
              key={index}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                color: "var(--cream-muted)",
                padding: "0.3rem 0",
                borderBottom:
                  index < legs.length - 1
                    ? "1px solid rgba(255,255,255,0.05)"
                    : "none",
              }}
            >
              {leg.type === "hotel" ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.15rem",
                    }}
                  >
                    <span style={{ color: "#a78bfa" }}>
                      HOTEL · {leg.to || leg.from}
                    </span>
                    <span
                      style={{
                        color: leg.confirmed ? "#22c55e" : "var(--amber)",
                      }}
                    >
                      {leg.confirmed ? "Confirmed" : "Pending"}
                    </span>
                  </div>
                  {leg.provider && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.6rem",
                      }}
                    >
                      <span>{leg.provider}</span>
                      {leg.price !== undefined && (
                        <span style={{ color: "var(--cream)" }}>
                          ${leg.price} {leg.currency || ""}
                        </span>
                      )}
                    </div>
                  )}
                  {(leg.start_time || leg.end_time) && (
                    <div
                      style={{
                        fontSize: "0.6rem",
                        color: "var(--cream-muted)",
                        marginTop: "0.1rem",
                      }}
                    >
                      {leg.start_time && (
                        <span>Check-in: {leg.start_time}</span>
                      )}
                      {leg.start_time && leg.end_time && <span> · </span>}
                      {leg.end_time && <span>Check-out: {leg.end_time}</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: leg.hotels?.length ? "0.3rem" : 0,
                    }}
                  >
                    <span>
                      {leg.type === "road_trip" ||
                      leg.type === "bus" ||
                      leg.type === "train"
                        ? "GROUND"
                        : "FLIGHT"}{" "}
                      · {leg.from} → {leg.to}
                    </span>
                    <span
                      style={{
                        color: leg.confirmed ? "#22c55e" : "var(--amber)",
                      }}
                    >
                      {leg.confirmed ? "Confirmed" : "Pending"}
                    </span>
                  </div>
                  {(leg.provider || leg.price) && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.6rem",
                      }}
                    >
                      <span>{leg.provider || leg.type}</span>
                      {leg.price !== undefined && (
                        <span style={{ color: "var(--cream)" }}>
                          ${leg.price} {leg.currency || ""}
                        </span>
                      )}
                    </div>
                  )}
                  {leg.hotels && leg.hotels.length > 0 && (
                    <div
                      style={{
                        marginLeft: "1rem",
                        fontSize: "0.6rem",
                        color: "var(--amber)",
                      }}
                    >
                      {leg.hotels.slice(0, 3).map((hotel, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "0.15rem 0",
                          }}
                        >
                          <span>{hotel.name}</span>
                          <span>
                            ${hotel.price} {hotel.currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {viability && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem",
            background:
              viability.verdict === "viable"
                ? "rgba(34,197,94,0.1)"
                : "rgba(239,68,68,0.1)",
            borderRadius: "0.4rem",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: viability.verdict === "viable" ? "#22c55e" : "#ef4444",
              letterSpacing: "0.1em",
              marginBottom: "0.25rem",
            }}
          >
            VIABILITY: {viability.verdict.toUpperCase()}
          </div>
          {viability.total_cost > 0 && (
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.2rem",
                fontWeight: 700,
                color: "var(--amber-bright)",
              }}
            >
              Est. ${viability.total_cost} {viability.currency}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {topFlight && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--cream-muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top Flight</span>
            <span style={{ color: "var(--amber-bright)" }}>
              ${topFlight.price} {topFlight.currency}
            </span>
          </div>
        )}
        {topRoute && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--cream-muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              Top Route
              {topRoute.transfers !== undefined
                ? ` · ${topRoute.transfers} transfer${topRoute.transfers === 1 ? "" : "s"}`
                : ""}
            </span>
            <span style={{ color: "var(--amber-bright)" }}>
              ${topRoute.price} {topRoute.currency}
            </span>
          </div>
        )}
        {topHotel && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--cream-muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Top Hotel: {topHotel.name}</span>
            <span style={{ color: "var(--amber-bright)" }}>
              ${topHotel.price} {topHotel.currency}
            </span>
          </div>
        )}
      </div>

      {(trip.tags?.length || trip.notes) && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--cream-muted)",
            lineHeight: 1.5,
          }}
        >
          {trip.tags?.length ? (
            <div>{trip.tags.map((tag) => `#${tag}`).join(" ")}</div>
          ) : null}
          {trip.notes ? <div>{trip.notes}</div> : null}
        </div>
      )}
    </div>
  );
}

function hotelLegsToPoints(legs: TripLeg[]): PointDatum[] {
  return legs
    .filter((leg) => leg.type === "hotel")
    .map((leg, index) => {
      const city = leg.to || leg.from;
      const coords = getCityCoords(city);
      if (!coords) return null;
      return {
        id: `hotel-${index}`,
        lat: coords.lat,
        lng: coords.lng,
        color: leg.confirmed ? "#a78bfa" : "#6d28d9",
        label: leg.provider ? `${leg.provider} · ${city}` : city,
      } as PointDatum;
    })
    .filter((p): p is PointDatum => p !== null);
}

export function ResultsCanvas({ state }: { state: AgentState }) {
  const activeTrip = useMemo(() => getActiveTrip(state), [state]);

  const tripArcs = useMemo(() => {
    if (!activeTrip?.legs?.length) return [];
    return tripLegsToArcs(activeTrip.legs);
  }, [activeTrip]);

  const allPoints = useMemo(() => {
    if (!activeTrip?.legs?.length) return [];
    return [
      ...tripLegsToAirportPoints(activeTrip.legs),
      ...hotelLegsToPoints(activeTrip.legs),
    ];
  }, [activeTrip]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <GlobeCanvas arcs={tripArcs} points={allPoints} />
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
        {activeTrip && (
          <ErrorBoundary
            FallbackComponent={CardRenderFallback}
            onError={(error) => {
              console.error("RenderErrorBoundary(activeTrip)", error);
            }}
          >
            <ActiveTripCard trip={activeTrip} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
