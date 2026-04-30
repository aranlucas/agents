"use client";

import { useMemo } from "react";
import { useCoAgent } from "@copilotkit/react-core";
import type { AgentState, TripLeg } from "@/lib/types";
import { getActiveTrip } from "@/lib/state";
import { GlobeCanvas } from "./globe-canvas";
import { CITIES, type CityCoord } from "@/lib/cities";
import type { ArcDatum, PointDatum } from "@/lib/types";

function getCityCoords(city: string): CityCoord | null {
  if (!city) return null;
  if (CITIES[city]) return CITIES[city];

  const cityOnly = city.split(",")[0].trim().toLowerCase();
  const match = Object.entries(CITIES).find(
    ([key]) => key.split(",")[0].trim().toLowerCase() === cityOnly,
  );
  if (match) return match[1];

  const partialMatch = Object.entries(CITIES).find(
    ([key]) =>
      key.toLowerCase().includes(cityOnly) ||
      cityOnly.includes(key.split(",")[0].trim().toLowerCase()),
  );

  return partialMatch ? partialMatch[1] : null;
}

function tripLegsToArcs(legs: TripLeg[]): ArcDatum[] {
  return legs
    .map((leg, index) => {
      if (leg.type === "hotel") return null;
      const start = getCityCoords(leg.from);
      const end = getCityCoords(leg.to);
      if (!start || !end) return null;

      const isRoadTrip =
        leg.type === "road_trip" || leg.type === "bus" || leg.type === "train";
      const op = leg.confirmed ? 0.9 : 0.4;

      const color: [string, string] = isRoadTrip
        ? [`rgba(59,130,246,${op})`, `rgba(99,102,241,${op})`]
        : [`rgba(245,158,11,${op})`, `rgba(239,68,68,${op})`];

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

export function TripGlobeView() {
  const { state } = useCoAgent<AgentState>({
    name: "my_agent",
    initialState: {},
  });

  const activeTrip = useMemo(() => getActiveTrip(state), [state]);

  const tripArcs = useMemo(() => {
    if (!activeTrip?.legs?.length) return [];
    return tripLegsToArcs(activeTrip.legs);
  }, [activeTrip]);

  const allPoints = useMemo(() => {
    if (!activeTrip?.legs?.length) return [];
    return [...tripLegsToAirportPoints(activeTrip.legs), ...hotelLegsToPoints(activeTrip.legs)];
  }, [activeTrip]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <GlobeCanvas arcs={tripArcs} points={allPoints} />
    </div>
  );
}
