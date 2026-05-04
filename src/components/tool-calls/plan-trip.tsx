"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SingleResultToolCall } from "./single-result-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface TripFlight {
  price: number;
  currency: string;
  airline: string;
  flight_number: string;
  stops: number;
  duration_min: number;
  departure: string;
  arrival: string;
  route: string;
}

interface TripHotel {
  name: string;
  price?: number;
  currency?: string;
  rating?: number;
}

function renderFlightRow(f: TripFlight, index: number) {
  const h = Math.floor(f.duration_min / 60);
  const m = f.duration_min % 60;
  const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const stopStr = f.stops === 0 ? "Nonstop" : `${f.stops} stop${f.stops === 1 ? "" : "s"}`;

  return (
    <div key={index} className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-900">{f.airline} {f.flight_number}</div>
        <div className="text-[0.68rem] text-slate-500">{f.route} · {dur} · {stopStr}</div>
      </div>
      <div className="shrink-0 text-xs font-semibold text-emerald-700">
        {formatMoney(f.price, f.currency)}
      </div>
    </div>
  );
}

function renderTripBody(parsedResult: unknown) {
  const record = toRecord(parsedResult);
  if (!record) return null;

  const origin = typeof record.origin === "string" ? record.origin : "";
  const destination = typeof record.destination === "string" ? record.destination : "";
  const departDate = typeof record.depart_date === "string" ? record.depart_date : "";
  const returnDate = typeof record.return_date === "string" ? record.return_date : "";
  const nights = typeof record.nights === "number" ? record.nights : null;
  const guests = typeof record.guests === "number" ? record.guests : null;
  const outbound = Array.isArray(record.outbound_flights) ? (record.outbound_flights as TripFlight[]) : [];
  const returning = Array.isArray(record.return_flights) ? (record.return_flights as TripFlight[]) : [];
  const hotels = Array.isArray(record.hotels) ? (record.hotels as TripHotel[]) : [];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">{origin} → {destination}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {departDate} – {returnDate}
          {nights != null && ` · ${nights} nights`}
          {guests != null && ` · ${guests} guest${guests === 1 ? "" : "s"}`}
        </div>
      </div>

      {outbound.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-slate-400">Outbound</div>
          <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 px-3">
            {outbound.slice(0, 3).map(renderFlightRow)}
          </div>
        </div>
      )}

      {returning.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-slate-400">Return</div>
          <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 px-3">
            {returning.slice(0, 3).map(renderFlightRow)}
          </div>
        </div>
      )}

      {hotels.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-slate-400">Hotels</div>
          <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 px-3">
            {hotels.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                <div className="text-xs font-semibold text-slate-900">{h.name}</div>
                {h.price != null && (
                  <div className="shrink-0 text-xs font-semibold text-emerald-700">
                    {formatMoney(h.price, h.currency ?? "")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function tripDescription(parsedResult: unknown): string {
  const record = toRecord(parsedResult);
  const origin = typeof record?.origin === "string" ? record.origin : "?";
  const destination = typeof record?.destination === "string" ? record.destination : "?";
  const depart = typeof record?.depart_date === "string" ? record.depart_date : "";
  const ret = typeof record?.return_date === "string" ? record.return_date : "";
  const guests = typeof record?.guests === "number" ? record.guests : null;
  return `User is reviewing a trip package: ${origin} → ${destination}, ${depart}–${ret}${guests != null ? `, ${guests} guest${guests === 1 ? "" : "s"}` : ""}.`;
}

export function PlanTripToolCall({
  status,
  name,
  args,
  result,
}: {
  status: ToolStatus;
  name: string;
  args?: unknown;
  result?: unknown;
}) {
  return (
    <SingleResultToolCall
      status={status}
      name={name}
      args={args}
      result={result}
      renderBody={renderTripBody}
      reviewingDescription={tripDescription}
    />
  );
}
