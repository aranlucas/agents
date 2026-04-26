import { AgentState, ArcDatum, StoredFlightResult, StoredDateResult } from "./types";
import { AIRPORTS } from "./airports";

const SEA = AIRPORTS["SEA"];
const ARC_COLOR_LATEST = "#F59E0B";
const ARC_COLOR_OLD = "rgba(255,255,255,0.2)";

export function deriveArcs(state: AgentState): ArcDatum[] {
  const flights = state.flight_results ?? [];
  const dates = state.date_results ?? [];

  type Entry = { id: string; dest: string; ts: number };
  const entries: Entry[] = [
    ...flights.map((r: StoredFlightResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
    })),
    ...dates.map((r: StoredDateResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
    })),
  ];

  if (entries.length === 0) return [];

  const maxTs = Math.max(...entries.map((e) => e.ts));

  return entries.flatMap((entry): ArcDatum[] => {
    const dst = AIRPORTS[entry.dest.toUpperCase()];
    if (!dst) return [];
    const isLatest = entry.ts === maxTs;
    return [
      {
        id: entry.id,
        startLat: SEA.lat,
        startLng: SEA.lng,
        endLat: dst.lat,
        endLng: dst.lng,
        color: isLatest ? ARC_COLOR_LATEST : ARC_COLOR_OLD,
        strokeWidth: isLatest ? 1.5 : 0.8,
      },
    ];
  });
}
