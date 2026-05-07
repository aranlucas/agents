"use client";

import { useState } from "react";
import { z } from "zod";
import {
  useAgent,
  UseAgentUpdate,
  useAgentContext,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import type {
  AgentState,
  ActiveTrip,
  RouteOption,
  HotelOption,
  StoredRouteResult,
  StoredHotelResult,
  StoredViabilityResult,
  ViabilityCheck,
} from "@/lib/types";
import {
  getActiveTrip,
  getRouteResults,
  getHotelResults,
  getViabilityResults,
} from "@/lib/state";
import { formatMoney } from "@/components/mcp-tool-call/format";

// ─── Phase logic ─────────────────────────────────────────────────────────────

type Phase = "discover" | "transport" | "lodging" | "verify" | "saved";

const PHASES: { id: Phase; label: string; icon: string }[] = [
  { id: "discover", label: "Discover", icon: "🌍" },
  { id: "transport", label: "Fly", icon: "✈️" },
  { id: "lodging", label: "Stay", icon: "🏨" },
  { id: "verify", label: "Verify", icon: "✓" },
  { id: "saved", label: "Booked", icon: "🎉" },
];

const PHASE_INDEX: Record<Phase, number> = {
  discover: 0,
  transport: 1,
  lodging: 2,
  verify: 3,
  saved: 4,
};

function resolvePhase(
  trip: ActiveTrip | null,
  routes: StoredRouteResult[],
  hotels: StoredHotelResult[],
  viability: StoredViabilityResult[],
): Phase {
  if (trip?.id && trip.status === "saved") return "saved";
  if (viability.length > 0) return "verify";
  if (hotels.length > 0 || trip?.lodging?.options?.length) return "lodging";
  if (routes.length > 0 || trip?.transport?.options?.length) return "transport";
  if (trip?.destination) return "transport";
  return "discover";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(mins: unknown): string {
  const v = typeof mins === "number" ? mins : Number(mins);
  if (!Number.isFinite(v)) return "";
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function routeSummary(route: RouteOption, index: number): string {
  const legs = Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0] as Record<string, unknown> | undefined;
  const last = legs[legs.length - 1] as Record<string, unknown> | undefined;
  const airline =
    (first?.airline as string) ??
    (route.provider as string | undefined)?.replace(/_/g, " ") ??
    `Option ${index + 1}`;
  const from = (first?.departure_airport as Record<string, unknown>)?.code as string | undefined;
  const to = (last?.arrival_airport as Record<string, unknown>)?.code as string | undefined;
  const price = formatMoney(route.price, (route.currency as string) ?? "USD");
  return `${airline}${from && to ? ` ${from}→${to}` : ""} ${price}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PhaseBar({ phase }: { phase: Phase }) {
  const current = PHASE_INDEX[phase];
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)] mb-3">
        Planning progress
      </p>
      <div className="flex items-center">
        {PHASES.map((p, i) => (
          <div key={p.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all ${
                  i < current
                    ? "bg-[var(--green)] text-white"
                    : i === current
                      ? "bg-[var(--amber)] text-[var(--bg)] ring-2 ring-[var(--amber)] ring-offset-1 ring-offset-[var(--bg-card)]"
                      : "bg-[var(--border)] text-[var(--cream-muted)]"
                }`}
              >
                {i < current ? "✓" : p.icon}
              </div>
              <span
                className={`text-[0.6rem] font-mono hidden sm:block ${
                  i === current ? "text-[var(--amber)]" : i < current ? "text-[var(--green)]" : "text-[var(--cream-muted)]"
                }`}
              >
                {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`h-px flex-1 mx-1 ${i < current ? "bg-[var(--green)]" : "bg-[var(--border)]"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: ActiveTrip }) {
  const legs = trip.legs ?? [];
  const flightLegs = legs.filter((l) => l.type !== "hotel");
  const hotelLegs = legs.filter((l) => l.type === "hotel");

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[var(--amber-dim)]/30 to-transparent flex items-center justify-between">
        <div>
          <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--amber-dim)]">
            Active trip
          </p>
          <h3 className="font-display text-lg text-[var(--cream)] tracking-wide mt-0.5">
            {trip.name ?? `${trip.origin ?? "?"} → ${trip.destination ?? "?"}`}
          </h3>
        </div>
        {trip.status && (
          <span className="text-[0.6rem] font-mono uppercase tracking-wide px-2 py-0.5 rounded border border-[var(--amber-dim)] text-[var(--amber)]">
            {trip.status}
          </span>
        )}
      </div>

      {(trip.origin || trip.destination) && (
        <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--border-dim)]">
          <div className="text-center">
            <p className="font-mono text-sm font-bold text-[var(--cream)]">{trip.origin ?? "—"}</p>
            <p className="text-[0.6rem] text-[var(--cream-muted)] font-mono uppercase">Origin</p>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[var(--amber)]">✈</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="text-center">
            <p className="font-mono text-sm font-bold text-[var(--cream)]">{trip.destination ?? "—"}</p>
            <p className="text-[0.6rem] text-[var(--cream-muted)] font-mono uppercase">Dest.</p>
          </div>
        </div>
      )}

      {legs.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {flightLegs.map((leg, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono text-[var(--cream-muted)]">
              <span className="text-[var(--amber)]">✈</span>
              <span>{leg.from} → {leg.to}</span>
              {leg.start_time && <span className="opacity-60">{fmtDate(leg.start_time)}</span>}
              {leg.confirmed && <span className="text-[var(--green)] ml-auto">✓</span>}
            </div>
          ))}
          {hotelLegs.map((leg, i) => (
            <div key={`h${i}`} className="flex items-center gap-2 text-xs font-mono text-[var(--cream-muted)]">
              <span className="text-[var(--blue)]">🏨</span>
              <span>{leg.provider ?? leg.to ?? leg.from}</span>
              {leg.confirmed && <span className="text-[var(--green)] ml-auto">✓</span>}
            </div>
          ))}
        </div>
      )}

      {trip.viability && (
        <div
          className={`px-4 py-2 border-t border-[var(--border-dim)] flex items-center justify-between text-xs font-mono ${
            trip.viability.verdict === "feasible" ? "text-[var(--green)]" : "text-[var(--amber)]"
          }`}
        >
          <span className="uppercase tracking-wide">{trip.viability.verdict}</span>
          <span>{formatMoney(trip.viability.total_cost, trip.viability.currency)} total est.</span>
        </div>
      )}
    </div>
  );
}

function FlightCard({
  route,
  index,
  selected,
  onToggle,
  onBook,
}: {
  route: RouteOption;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onBook: (msg: string) => void;
}) {
  const legs = Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0] as Record<string, unknown> | undefined;
  const last = legs[legs.length - 1] as Record<string, unknown> | undefined;
  const airline =
    (first?.airline as string) ??
    (route.provider as string | undefined)?.replace(/_/g, " ") ??
    `Flight ${index + 1}`;
  const flightNum = [(first?.airline_code as string), (first?.flight_number as string)].filter(Boolean).join("");
  const from = (first?.departure_airport as Record<string, unknown>)?.code as string | undefined;
  const to = (last?.arrival_airport as Record<string, unknown>)?.code as string | undefined;
  const stops =
    typeof route.stops === "number"
      ? route.stops === 0 ? "Nonstop" : `${route.stops} stop${route.stops > 1 ? "s" : ""}`
      : typeof route.transfers === "number"
        ? route.transfers === 0 ? "Nonstop" : `${route.transfers} stop${route.transfers > 1 ? "s" : ""}`
        : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-lg border transition-all p-3 ${
        selected
          ? "border-[var(--amber)] bg-[var(--bg-card-hover)] ring-1 ring-[var(--amber-dim)]"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--amber-dim)] hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-[var(--cream)]">{airline}</span>
            {flightNum && <span className="text-[0.6rem] font-mono text-[var(--cream-muted)]">{flightNum}</span>}
          </div>
          {from && to && (
            <p className="font-mono text-xs text-[var(--cream-muted)] mt-0.5">{from} → {to}</p>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {stops && (
              <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--cream-muted)]">
                {stops}
              </span>
            )}
            {route.duration && (
              <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--cream-muted)]">
                {fmtDuration(route.duration)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-base font-bold text-[var(--amber-bright)]">
            {formatMoney(route.price, (route.currency as string) ?? "USD")}
          </p>
          <p className="text-[0.6rem] font-mono text-[var(--cream-muted)] uppercase">per person</p>
        </div>
      </div>
      {selected && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBook(`Book this flight: ${routeSummary(route, index)}`); }}
            className="flex-1 text-[0.68rem] font-mono uppercase tracking-[0.14em] py-1.5 rounded bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber-bright)] transition-colors font-bold"
          >
            Use this flight →
          </button>
        </div>
      )}
    </button>
  );
}

function HotelCard({
  hotel,
  index,
  selected,
  onToggle,
  onBook,
}: {
  hotel: HotelOption;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onBook: (msg: string) => void;
}) {
  const stars = typeof hotel.stars === "number" ? hotel.stars : null;
  const rating = typeof hotel.rating === "number" ? hotel.rating : null;
  const neighborhood = (hotel.neighborhood as string) ?? (hotel.address as string) ?? null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-lg border transition-all p-3 ${
        selected
          ? "border-[var(--blue)] bg-[var(--bg-card-hover)] ring-1 ring-[var(--blue)]/30"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--blue)]/40 hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-[var(--cream)] truncate">{hotel.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {stars && <span className="text-[var(--amber)] text-xs">{"★".repeat(Math.min(stars, 5))}</span>}
            {rating && <span className="text-[0.6rem] font-mono text-[var(--cream-muted)]">{rating}/10</span>}
          </div>
          {neighborhood && (
            <p className="text-[0.65rem] font-mono text-[var(--cream-muted)] mt-1 truncate">{neighborhood}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-base font-bold text-[var(--blue)]">
            {formatMoney(hotel.price, hotel.currency)}
          </p>
          <p className="text-[0.6rem] font-mono text-[var(--cream-muted)] uppercase">/night</p>
        </div>
      </div>
      {selected && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBook(`Book ${hotel.name} at ${formatMoney(hotel.price, hotel.currency)}/night`); }}
            className="flex-1 text-[0.68rem] font-mono uppercase tracking-[0.14em] py-1.5 rounded bg-[var(--blue)]/20 text-[var(--blue)] border border-[var(--blue)]/40 hover:bg-[var(--blue)]/30 transition-colors font-bold"
          >
            Use this hotel →
          </button>
        </div>
      )}
    </button>
  );
}

function ViabilityCard({ results }: { results: StoredViabilityResult[] }) {
  const latest = results[results.length - 1];
  if (!latest) return null;

  const verdictColor =
    latest.verdict === "feasible" ? "text-[var(--green)]" :
    latest.verdict === "tight" ? "text-[var(--amber)]" : "text-[var(--red)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-dim)] flex items-center justify-between">
        <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)]">
          Viability check
        </p>
        <span className={`text-sm font-mono font-bold uppercase ${verdictColor}`}>
          {latest.verdict}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {(latest.checks as ViabilityCheck[]).map((check, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`text-xs mt-0.5 shrink-0 ${
              check.status === "ok" || check.status === "green" ? "text-[var(--green)]" :
              check.status === "yellow" ? "text-[var(--amber)]" : "text-[var(--red)]"
            }`}>
              {check.status === "ok" || check.status === "green" ? "✓" : "⚠"}
            </span>
            <div>
              <p className="text-[0.65rem] font-mono text-[var(--cream)] uppercase tracking-wide">{check.dimension}</p>
              <p className="text-[0.68rem] text-[var(--cream-muted)] leading-relaxed">{check.summary}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-[var(--border-dim)] flex items-center justify-between">
        <span className="text-[0.6rem] font-mono text-[var(--cream-muted)] uppercase">Total estimate</span>
        <span className="font-mono text-sm font-bold text-[var(--cream)]">
          {formatMoney(latest.total_cost, latest.currency)}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  const prompts = [
    "Find me a weekend deal from Seattle",
    "Where can I go for under $800?",
    "Flights to Tokyo next month",
    "Surprise me with a destination ✨",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <div className="text-4xl mb-3">✈️</div>
        <h3 className="font-display text-2xl text-[var(--cream)] tracking-wide mb-2">
          Where to next?
        </h3>
        <p className="text-sm text-[var(--cream-muted)] font-mono leading-relaxed max-w-xs">
          Your trip plan builds here as we plan together.
        </p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)] text-center mb-2">
          Try asking →
        </p>
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSend(p)}
            className="w-full text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--amber-dim)] hover:bg-[var(--bg-card-hover)] transition-all group"
          >
            <span className="text-[var(--amber)] mr-2 group-hover:text-[var(--amber-bright)] transition-colors">→</span>
            <span className="text-sm font-mono text-[var(--cream-muted)] group-hover:text-[var(--cream)] transition-colors">{p}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickActions({
  activeTrip,
  hasRoutes,
  hasHotels,
  onSend,
}: {
  activeTrip: ActiveTrip | null;
  hasRoutes: boolean;
  hasHotels: boolean;
  onSend: (msg: string) => void;
}) {
  const dest = activeTrip?.destination;
  const origin = activeTrip?.origin ?? "Seattle";

  const actions: { label: string; prompt: string }[] = [];
  if (!dest) {
    actions.push(
      { label: "🔥 Show deals", prompt: "Show me the best weekend deals from Seattle" },
      { label: "💸 Under $500", prompt: "Where can I fly from Seattle for under $500?" },
    );
  } else if (!hasRoutes) {
    actions.push(
      { label: "✈️ Search flights", prompt: `Search flights from ${origin} to ${dest}` },
      { label: "📅 Cheapest dates", prompt: `Find cheapest dates to fly to ${dest}` },
    );
  } else if (!hasHotels) {
    actions.push(
      { label: "🏨 Find hotels", prompt: `Search hotels in ${dest}` },
      { label: "⭐ Best value", prompt: `Find best value 4-star hotels in ${dest}` },
    );
  } else {
    actions.push(
      { label: "💰 Check budget", prompt: "Estimate the total cost of this trip" },
      { label: "🛂 Visa check", prompt: `Do I need a visa to visit ${dest}?` },
      { label: "💾 Save trip", prompt: "Save this trip plan" },
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)] mb-3">
        Quick actions
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.prompt}
            type="button"
            onClick={() => onSend(a.prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--amber-dim)] hover:bg-[var(--bg-card-hover)] transition-all text-xs font-mono text-[var(--cream-muted)] hover:text-[var(--cream)] group"
          >
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TripCanvas() {
  const { agent } = useAgent({
    agentId: "my_agent",
    updates: [UseAgentUpdate.OnStateChanged],
  });

  const state = (agent?.state ?? {}) as AgentState;
  const activeTrip = getActiveTrip(state);
  const routeResults = getRouteResults(state);
  const hotelResults = getHotelResults(state);
  const viabilityResults = getViabilityResults(state);

  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [selectedHotelKey, setSelectedHotelKey] = useState<string | null>(null);

  const sendMessage = (content: string) => {
    agent?.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content,
    });
  };

  const phase = resolvePhase(activeTrip, routeResults, hotelResults, viabilityResults);
  const latestRoutes = routeResults[routeResults.length - 1];
  const latestHotels = hotelResults[hotelResults.length - 1];

  const selectedRoute = selectedRouteKey && latestRoutes
    ? latestRoutes.routes.find((r, i) => `r${i}-${r.price}` === selectedRouteKey) ?? null
    : null;

  const selectedHotel = selectedHotelKey && latestHotels
    ? latestHotels.hotels.find((h, i) => `h${i}-${h.name}` === selectedHotelKey) ?? null
    : null;

  // Share what user is looking at with the agent
  useAgentContext({
    description: "Trip planning canvas — current state and user selections",
    value: {
      phase,
      selected_flight: selectedRoute
        ? { label: routeSummary(selectedRoute, 0), price: selectedRoute.price, currency: selectedRoute.currency }
        : null,
      selected_hotel: selectedHotel
        ? { name: selectedHotel.name, price: selectedHotel.price, currency: selectedHotel.currency }
        : null,
      available_flights: latestRoutes
        ? { count: latestRoutes.routes.length, search: latestRoutes.args }
        : null,
      available_hotels: latestHotels
        ? { count: latestHotels.hotels.length, search: latestHotels.args }
        : null,
    },
  });

  // Agent can highlight canvas items
  useFrontendTool({
    name: "highlight_canvas_item",
    description: "Highlight a flight or hotel in the trip canvas to draw the user's attention",
    parameters: z.object({
      type: z.string().describe("flight or hotel"),
      index: z.number().describe("zero-based index of the item"),
    }),
    handler: async ({ type, index }: { type: string; index: number }) => {
      if (type === "flight" && latestRoutes?.routes[index]) {
        setSelectedRouteKey(`r${index}-${latestRoutes.routes[index].price}`);
        return `Highlighted flight ${index + 1}`;
      }
      if (type === "hotel" && latestHotels?.hotels[index]) {
        setSelectedHotelKey(`h${index}-${latestHotels.hotels[index].name}`);
        return `Highlighted ${latestHotels.hotels[index].name}`;
      }
      return "Item not found";
    },
  });

  const isEmpty = !activeTrip && routeResults.length === 0 && hotelResults.length === 0;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-[0.6rem] font-mono uppercase tracking-[0.2em] text-[var(--cream-muted)]">
            Trip planner
          </p>
          <h2 className="font-display text-xl text-[var(--cream)] tracking-wide">
            {activeTrip?.name ?? (activeTrip?.destination ? `→ ${activeTrip.destination}` : "Your Journey")}
          </h2>
        </div>
        {agent && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-[0.6rem] font-mono text-[var(--cream-muted)] uppercase tracking-wide">Live</span>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState onSend={sendMessage} />
      ) : (
        <>
          <PhaseBar phase={phase} />

          {activeTrip && <TripCard trip={activeTrip} />}

          {latestRoutes && latestRoutes.routes.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-dim)] flex items-center justify-between">
                <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)]">
                  Flight options
                </p>
                <span className="text-[0.6rem] font-mono text-[var(--amber-dim)]">
                  {latestRoutes.routes.length} found
                </span>
              </div>
              <div className="p-3 space-y-2">
                {latestRoutes.routes.slice(0, 6).map((route, i) => {
                  const key = `r${i}-${route.price}`;
                  return (
                    <FlightCard
                      key={key}
                      route={route}
                      index={i}
                      selected={selectedRouteKey === key}
                      onToggle={() => { setSelectedRouteKey((p: string | null) => p === key ? null : key); }}
                      onBook={sendMessage}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {latestHotels && latestHotels.hotels.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-dim)] flex items-center justify-between">
                <p className="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-[var(--cream-muted)]">
                  Hotel options
                </p>
                <span className="text-[0.6rem] font-mono text-[var(--blue)]/70">
                  {latestHotels.hotels.length} found
                </span>
              </div>
              <div className="p-3 space-y-2">
                {latestHotels.hotels.slice(0, 6).map((hotel, i) => {
                  const key = `h${i}-${hotel.name}`;
                  return (
                    <HotelCard
                      key={key}
                      hotel={hotel}
                      index={i}
                      selected={selectedHotelKey === key}
                      onToggle={() => { setSelectedHotelKey((p: string | null) => p === key ? null : key); }}
                      onBook={sendMessage}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {viabilityResults.length > 0 && <ViabilityCard results={viabilityResults} />}

          <QuickActions
            activeTrip={activeTrip}
            hasRoutes={routeResults.length > 0}
            hasHotels={hotelResults.length > 0}
            onSend={sendMessage}
          />
        </>
      )}

      <div className="h-4 shrink-0" />
    </div>
  );
}
