import { formatMoney, formatScalar, humanizeKey } from "./format";
import { toRecord } from "./payload";
import type { JsonRecord, ResultHighlight, ResultItem } from "./types";

export function buildInputChips(args: JsonRecord | null): string[] {
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

export function buildHighlights(name: string, result: unknown): ResultHighlight[] {
  const record = toRecord(result);
  if (!record) return [];

  const nestedResult = toRecord(record.result);
  const data = nestedResult ?? record;

  const lists = [
    ["Flights", getArray(data, "flights").length],
    ["Hotels", getArray(data, "hotels").length],
    ["Routes", getArray(data, "routes", "itineraries").length],
    ["Deals", getArray(data, "deals").length],
    ["Events", getArray(data, "events").length],
    ["Trips", getArray(data, "trips").length],
    ["Destinations", getArray(data, "destinations").length],
  ].filter(([, count]) => Number(count) > 0);

  const price = firstDefined(
    data.total_cost,
    data.total,
    data.price,
    data.estimated_total,
  );
  const currency = typeof data.currency === "string" ? data.currency : "";
  const verdict = firstDefined(data.verdict, data.requirement, data.status);

  return [
    ...lists.map(([label, count]) => ({
      label: String(label),
      value: String(count),
    })),
    ...(price != null ? [{ label: "Cost", value: formatMoney(price, currency) }] : []),
    ...(verdict != null
      ? [
          {
            label: name === "check_visa" ? "Visa" : "Verdict",
            value: formatScalar(verdict),
          },
        ]
      : []),
  ].slice(0, 4);
}

export function buildResultItems(name: string, result: unknown): ResultItem[] {
  const record = toRecord(result);
  if (!record) return [];
  const data = toRecord(record.result) ?? record;

  const source =
    getArray(data, "flights") ||
    getArray(data, "hotels") ||
    getArray(data, "routes", "itineraries") ||
    getArray(data, "deals") ||
    getArray(data, "events") ||
    getArray(data, "restaurants") ||
    getArray(data, "destinations") ||
    getArray(data, "candidates") ||
    getArray(data, "trips") ||
    getArray(data, "watches") ||
    getArray(data, "providers") ||
    [];

  if (source.length === 0 && name === "check_visa") {
    return [
      {
        title: formatScalar(firstDefined(data.requirement, data.verdict, "Visa check")),
        detail: formatScalar(firstDefined(data.notes, data.summary, data.reason, "")),
      },
    ];
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
  const subtitle = [
    item.origin,
    item.from,
    item.departure_airport,
    item.destination,
    item.to,
    item.arrival_airport,
  ]
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
