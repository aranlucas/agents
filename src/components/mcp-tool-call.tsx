"use client";

import { useMemo, useState } from "react";

type ToolStatus = "complete" | "inProgress" | "executing" | string;
type JsonRecord = Record<string, unknown>;

interface ToolCallProps {
  status: ToolStatus;
  name?: string;
  args?: unknown;
  result?: unknown;
}

type ToolMeta = {
  label: string;
  category: string;
  tone: "sky" | "green" | "amber" | "rose" | "violet" | "slate";
};

const TOOL_META: Record<string, ToolMeta> = {
  get_preferences: { label: "Load traveler profile", category: "Profile", tone: "slate" },
  update_preferences: { label: "Update traveler profile", category: "Profile", tone: "slate" },
  build_profile: { label: "Build inferred profile", category: "Profile", tone: "slate" },
  add_booking: { label: "Add booking history", category: "Profile", tone: "slate" },
  onboard_profile: { label: "Profile onboarding", category: "Profile", tone: "slate" },
  interview_trip: { label: "Trip interview", category: "Profile", tone: "slate" },

  weekend_getaway: { label: "Find weekend getaways", category: "Discovery", tone: "green" },
  suggest_dates: { label: "Suggest cheaper dates", category: "Discovery", tone: "green" },
  search_dates: { label: "Search date prices", category: "Discovery", tone: "green" },
  search_deals: { label: "Search travel deals", category: "Discovery", tone: "green" },
  destination_info: { label: "Check destination context", category: "Discovery", tone: "green" },
  travel_guide: { label: "Open travel guide", category: "Discovery", tone: "green" },
  get_weather: { label: "Check weather", category: "Discovery", tone: "green" },
  local_events: { label: "Find local events", category: "Discovery", tone: "green" },
  nearby_places: { label: "Find nearby places", category: "Discovery", tone: "green" },
  plan_trip: { label: "Plan trip package", category: "Discovery", tone: "green" },

  search_flights: { label: "Search flights", category: "Transport", tone: "sky" },
  plan_flight_bundle: { label: "Rank flight bundles", category: "Transport", tone: "sky" },
  find_interactive: { label: "Interactive flight search", category: "Transport", tone: "sky" },
  search_route: { label: "Search routes", category: "Transport", tone: "sky" },
  search_ground: { label: "Search ground transport", category: "Transport", tone: "sky" },
  search_airport_transfers: { label: "Search airport transfers", category: "Transport", tone: "sky" },
  get_baggage_rules: { label: "Check baggage rules", category: "Transport", tone: "sky" },
  search_lounges: { label: "Search airport lounges", category: "Transport", tone: "sky" },
  search_hidden_city: { label: "Analyze hidden-city fares", category: "Transport", tone: "sky" },
  search_awards: { label: "Search award sweet spots", category: "Transport", tone: "sky" },

  search_hotels: { label: "Search hotels", category: "Lodging", tone: "violet" },
  search_hotel_by_name: { label: "Find hotel by name", category: "Lodging", tone: "violet" },
  hotel_rooms: { label: "Check hotel rooms", category: "Lodging", tone: "violet" },
  hotel_prices: { label: "Compare hotel prices", category: "Lodging", tone: "violet" },
  hotel_reviews: { label: "Read hotel reviews", category: "Lodging", tone: "violet" },
  detect_accommodation_hacks: { label: "Find lodging hacks", category: "Lodging", tone: "violet" },
  watch_room_availability: { label: "Watch room availability", category: "Lodging", tone: "violet" },

  assess_trip: { label: "Assess trip viability", category: "Viability", tone: "amber" },
  calculate_trip_cost: { label: "Calculate trip cost", category: "Viability", tone: "amber" },
  check_visa: { label: "Check visa rules", category: "Viability", tone: "amber" },
  calculate_points_value: { label: "Value points redemption", category: "Viability", tone: "amber" },
  detect_travel_hacks: { label: "Find travel hacks", category: "Viability", tone: "amber" },
  optimize_booking: { label: "Optimize booking", category: "Viability", tone: "amber" },
  optimize_trip_dates: { label: "Optimize trip dates", category: "Viability", tone: "amber" },
  find_trip_window: { label: "Find trip window", category: "Viability", tone: "amber" },
  optimize_multi_city: { label: "Optimize multi-city route", category: "Viability", tone: "amber" },
  search_restaurants: { label: "Search restaurants", category: "Viability", tone: "amber" },

  create_trip: { label: "Create saved trip", category: "Itinerary", tone: "rose" },
  list_trips: { label: "List saved trips", category: "Itinerary", tone: "rose" },
  get_trip: { label: "Load saved trip", category: "Itinerary", tone: "rose" },
  update_trip: { label: "Update saved trip", category: "Itinerary", tone: "rose" },
  mark_trip_booked: { label: "Mark trip booked", category: "Itinerary", tone: "rose" },
  export_ics: { label: "Export calendar", category: "Itinerary", tone: "rose" },
  watch_price: { label: "Create price watch", category: "Itinerary", tone: "rose" },
  watch_opportunities: { label: "Watch opportunities", category: "Itinerary", tone: "rose" },
  list_opportunity_watches: { label: "List opportunity watches", category: "Itinerary", tone: "rose" },

  suggest_providers: { label: "Suggest providers", category: "Provider Admin", tone: "slate" },
  list_providers: { label: "List providers", category: "Provider Admin", tone: "slate" },
  configure_provider: { label: "Configure provider", category: "Provider Admin", tone: "slate" },
  test_provider: { label: "Test provider", category: "Provider Admin", tone: "slate" },
  provider_health: { label: "Check provider health", category: "Provider Admin", tone: "slate" },
  remove_provider: { label: "Remove provider", category: "Provider Admin", tone: "slate" },

  test_tool_with_progress: { label: "Test progress events", category: "Diagnostics", tone: "slate" },
};

const TONE_CLASSES: Record<ToolMeta["tone"], string> = {
  sky: "border-sky-400/25 bg-sky-400/10 text-sky-100",
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  amber: "border-amber-400/25 bg-amber-400/10 text-amber-100",
  rose: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  violet: "border-violet-400/25 bg-violet-400/10 text-violet-100",
  slate: "border-white/15 bg-white/7 text-stone-100",
};

export default function McpToolCall({ status, name = "", args, result }: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const meta = TOOL_META[name] ?? {
    label: humanizeToolName(name || "MCP tool call"),
    category: "TRVL MCP",
    tone: "slate" as const,
  };

  const parsedArgs = useMemo(() => toRecord(args), [args]);
  const parsedResult = useMemo(() => unwrapResult(result), [result]);
  const running = status === "inProgress" || status === "executing";
  const error = getError(parsedResult);
  const chips = buildInputChips(parsedArgs);
  const highlights = buildHighlights(name, parsedResult);
  const items = buildResultItems(name, parsedResult);

  return (
    <section className="w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b0d10]/90 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
      <button
        type="button"
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.04]"
        onClick={() => setIsOpen((open) => !open)}
      >
        <StatusMark running={running} complete={status === "complete"} error={Boolean(error)} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] ${TONE_CLASSES[meta.tone]}`}>
              {meta.category}
            </span>
            <span className="truncate text-sm font-semibold text-stone-100">{meta.label}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {chips.slice(0, 5).map((chip) => (
              <span key={chip} className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[0.68rem] text-stone-400">
                {chip}
              </span>
            ))}
          </span>
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-stone-500">
          {running ? "Running" : error ? "Error" : "Done"}
        </span>
      </button>

      {(isOpen || running || error || highlights.length > 0 || items.length > 0) && (
        <div className="border-t border-white/10 px-3 pb-3 pt-3">
          {running && (
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-300/80" />
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-md border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-100">
              {error}
            </div>
          )}

          {highlights.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {highlights.map((highlight) => (
                <div key={highlight.label} className="rounded-md border border-white/10 bg-black/25 p-2">
                  <div className="text-[0.62rem] uppercase tracking-[0.14em] text-stone-500">{highlight.label}</div>
                  <div className="mt-1 truncate text-sm font-semibold text-stone-100">{highlight.value}</div>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="grid gap-2">
              {items.slice(0, 4).map((item, index) => (
                <article key={`${item.title}-${index}`} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-stone-100">{item.title}</div>
                      {item.subtitle && <div className="mt-1 text-xs text-stone-400">{item.subtitle}</div>}
                    </div>
                    {item.price && <div className="shrink-0 text-sm font-semibold text-amber-200">{item.price}</div>}
                  </div>
                  {item.detail && <div className="mt-2 text-xs leading-5 text-stone-300">{item.detail}</div>}
                </article>
              ))}
            </div>
          )}

          {isOpen && (
            <div className="mt-3">
              <button
                type="button"
                className="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500 transition-colors hover:text-stone-200"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowJson((show) => !show);
                }}
              >
                {showJson ? "Hide exact payload" : "Show exact payload"}
              </button>

              {showJson && (
                <div className="mt-2 grid gap-2">
                  <PayloadBlock title="Parameters" value={args} />
                  {status === "complete" && <PayloadBlock title="Result" value={result} />}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusMark({ running, complete, error }: { running: boolean; complete: boolean; error: boolean }) {
  const classes = error
    ? "border-red-300 bg-red-400/25"
    : complete
      ? "border-emerald-300 bg-emerald-400/25"
      : "border-amber-300 bg-amber-400/25";

  return (
    <span className={`relative h-3 w-3 rounded-full border ${classes}`}>
      {running && <span className="absolute inset-[-5px] animate-ping rounded-full bg-amber-300/25" />}
    </span>
  );
}

function PayloadBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;

  return (
    <div>
      <div className="mb-1 text-[0.62rem] uppercase tracking-[0.14em] text-stone-500">{title}</div>
      <pre className="max-h-[260px] overflow-auto rounded-md border border-white/10 bg-black/35 p-2 text-xs leading-5 text-amber-50/80">
        {formatPayload(value)}
      </pre>
    </div>
  );
}

function unwrapResult(value: unknown): unknown {
  const parsed = parseJsonString(value);
  const record = toRecord(parsed);

  if (Array.isArray(parsed)) return parsed;
  if (!record) return parsed;

  const structured = record.structuredContent;
  if (structured != null) return unwrapResult(structured);

  const content = record.content;
  if (Array.isArray(content)) {
    const firstText = content.find((item) => toRecord(item)?.type === "text");
    const text = toRecord(firstText)?.text;
    if (typeof text === "string") return unwrapResult(text);
  }

  if (record.result != null && Object.keys(record).length <= 3) return unwrapResult(record.result);
  return record;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toRecord(value: unknown): JsonRecord | null {
  const parsed = parseJsonString(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : null;
}

function getError(value: unknown): string | null {
  const record = toRecord(value);
  if (!record) return typeof value === "string" ? value : null;
  if (record.success === false && typeof record.error === "string") return record.error;
  if (typeof record.error === "string") return record.error;
  return null;
}

function buildInputChips(args: JsonRecord | null): string[] {
  if (!args) return [];
  const priority = [
    "origin",
    "destination",
    "location",
    "city",
    "departure_date",
    "return_date",
    "check_in",
    "check_out",
    "date",
    "guests",
    "currency",
    "passport",
    "type",
  ];

  return priority
    .filter((key) => args[key] != null)
    .map((key) => `${humanizeKey(key)} ${formatScalar(args[key])}`)
    .concat(
      Object.keys(args)
        .filter((key) => !priority.includes(key))
        .slice(0, 3)
        .map((key) => `${humanizeKey(key)} ${formatScalar(args[key])}`),
    );
}

function buildHighlights(name: string, result: unknown): Array<{ label: string; value: string }> {
  const record = toRecord(result);
  if (!record) return [];

  const lists = [
    ["Flights", getArray(record, "flights").length],
    ["Hotels", getArray(record, "hotels").length],
    ["Routes", getArray(record, "routes", "itineraries").length],
    ["Deals", getArray(record, "deals").length],
    ["Events", getArray(record, "events").length],
    ["Trips", getArray(record, "trips").length],
  ].filter(([, count]) => Number(count) > 0);

  const price = firstDefined(record.total_cost, record.total, record.price, record.estimated_total);
  const currency = typeof record.currency === "string" ? record.currency : "";
  const verdict = firstDefined(record.verdict, record.requirement, record.status);

  return [
    ...lists.map(([label, count]) => ({ label: String(label), value: String(count) })),
    ...(price != null ? [{ label: "Cost", value: formatMoney(price, currency) }] : []),
    ...(verdict != null ? [{ label: name === "check_visa" ? "Visa" : "Verdict", value: formatScalar(verdict) }] : []),
  ].slice(0, 4);
}

type ResultItem = { title: string; subtitle?: string; detail?: string; price?: string };

function buildResultItems(name: string, result: unknown): ResultItem[] {
  const record = toRecord(result);
  if (!record) return [];

  const source =
    getArray(record, "flights") ||
    getArray(record, "hotels") ||
    getArray(record, "routes", "itineraries") ||
    getArray(record, "deals") ||
    getArray(record, "events") ||
    getArray(record, "restaurants") ||
    getArray(record, "destinations") ||
    getArray(record, "candidates") ||
    getArray(record, "trips") ||
    getArray(record, "watches") ||
    getArray(record, "providers") ||
    [];

  if (source.length === 0 && name === "check_visa") {
    return [{ title: formatScalar(firstDefined(record.requirement, record.verdict, "Visa check")), detail: formatScalar(firstDefined(record.notes, record.summary, record.reason, "")) }];
  }

  return source.map((item) => summarizeItem(item));
}

function summarizeItem(value: unknown): ResultItem {
  const item = toRecord(value);
  if (!item) return { title: formatScalar(value) };

  const title = formatScalar(
    firstDefined(
      item.name,
      item.title,
      item.hotel_name,
      item.airline,
      item.provider,
      item.destination,
      item.location,
      item.route,
      "Result",
    ),
  );
  const subtitle = [item.origin, item.from, item.departure_airport, item.destination, item.to, item.arrival_airport]
    .filter(Boolean)
    .map(formatScalar)
    .join(" -> ");
  const price = firstDefined(item.price, item.total_price, item.total, item.cost);
  const currency = typeof item.currency === "string" ? item.currency : "";
  const detail = formatScalar(
    firstDefined(
      item.summary,
      item.reason,
      item.description,
      item.verdict,
      item.rating != null ? `Rating ${item.rating}` : undefined,
      item.duration != null ? `Duration ${item.duration}` : undefined,
      "",
    ),
  );

  return {
    title,
    subtitle: subtitle || undefined,
    detail: detail || undefined,
    price: price != null ? formatMoney(price, currency) : undefined,
  };
}

function getArray(record: JsonRecord, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value != null && value !== "");
}

function formatPayload(content: unknown): string {
  const text = typeof content === "object" ? JSON.stringify(content, null, 2) : String(content);
  return text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function formatScalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatScalar).join(", ");
  return JSON.stringify(value);
}

function formatMoney(value: unknown, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return formatScalar(value);
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function humanizeToolName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeKey(value: string): string {
  return value.replace(/_/g, " ");
}
