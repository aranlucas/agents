import { AgentState, ArcDatum, StoredFlightResult, StoredDateResult } from "./types";
import { AIRPORTS } from "./airports";
import { getDateResults, getFlightResults } from "./state";

const SEA = AIRPORTS["SEA"];

function priceColor(price: number | null): string {
  if (price === null) return "#ffffff80";
  if (price < 150) return "#22c55e";
  if (price < 300) return "#f59e0b";
  return "#ef4444";
}

export function deriveArcs(state: AgentState): ArcDatum[] {
  return deriveArcsFromResults(getFlightResults(state), getDateResults(state));
}

export function deriveArcsFromResults(
  flights: StoredFlightResult[],
  dates: StoredDateResult[]
): ArcDatum[] {

  type Entry = { id: string; dest: string; ts: number; minPrice: number | null };

  const entries: Entry[] = [
    ...flights.map((r: StoredFlightResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
      minPrice: r.flights.length ? Math.min(...r.flights.map((f) => f.price)) : null,
    })),
    ...dates.map((r: StoredDateResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
      minPrice: r.dates.length ? Math.min(...r.dates.map((d) => d.price)) : null,
    })),
  ];

  if (entries.length === 0) return [];

  const maxTs = Math.max(...entries.map((e) => e.ts));

  return entries.flatMap((entry): ArcDatum[] => {
    const dst = AIRPORTS[entry.dest.toUpperCase()];
    if (!dst) return [];
    const isLatest = entry.ts === maxTs;
    const color = priceColor(entry.minPrice);
    // Dim older arcs by appending hex alpha to the color string
    const dimmed = color + "55";
    return [
      {
        id: entry.id,
        startLat: SEA.lat,
        startLng: SEA.lng,
        endLat: dst.lat,
        endLng: dst.lng,
        color: isLatest ? color : dimmed,
        strokeWidth: isLatest ? 1.5 : 0.7,
      },
    ];
  });
}
