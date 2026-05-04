"use client";

import { toRecord } from "../mcp-tool-call/payload";
import { SingleResultToolCall } from "./single-result-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface VisaRequirement {
  passport: string;
  destination: string;
  status: string;
  max_stay: string;
  notes: string;
}

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  "visa-free": { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700" },
  "freedom-of-movement": {
    border: "border-emerald-300",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  evisa: { border: "border-sky-300", bg: "bg-sky-50", text: "text-sky-700" },
  on_arrival: { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700" },
  required: { border: "border-red-300", bg: "bg-red-50", text: "text-red-700" },
};

function getVisaStyle(status: string) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.required;
}

function getRequirement(parsedResult: unknown): VisaRequirement | null {
  const record = toRecord(parsedResult);
  const structured = toRecord(record?.requirement) as unknown as VisaRequirement | null;
  if (structured) return structured;

  if (typeof parsedResult !== "string") return null;
  return parseVisaText(parsedResult);
}

function parseVisaText(text: string): VisaRequirement | null {
  const titleMatch = text.match(/Visa requirements:\s*(.+?)\s*→\s*(.+?)(?:\n|$)/);
  const statusMatch = text.match(/Status:\s*([^\n]+)/);
  const stayMatch = text.match(/Max stay:\s*([^\n]+)/);
  if (!titleMatch && !statusMatch && !stayMatch) return null;

  const noteIndex = text.indexOf("Note:");
  const notes = noteIndex >= 0 ? text.slice(noteIndex).trim() : "";

  return {
    passport: titleMatch?.[1]?.trim() ?? "?",
    destination: titleMatch?.[2]?.trim() ?? "?",
    status: normalizeStatus(statusMatch?.[1]?.trim() ?? "unknown"),
    max_stay: stayMatch?.[1]?.trim() ?? "",
    notes,
  };
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function renderVisaBody(parsedResult: unknown) {
  const req = getRequirement(parsedResult);
  if (!req) return null;

  const style = getVisaStyle(req.status);

  return (
    <div className="space-y-2">
      <div className={`rounded-md border p-3 ${style.border} ${style.bg}`}>
        <div className={`text-[0.62rem] uppercase tracking-[0.14em] font-semibold ${style.text}`}>
          {req.status.replace(/_/g, " ")}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">
          {req.passport} → {req.destination}
        </div>
        {req.max_stay && (
          <div className="mt-1 text-xs text-slate-600">Max stay: {req.max_stay}</div>
        )}
      </div>
      {req.notes && (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
          {req.notes}
        </div>
      )}
    </div>
  );
}

function visaDescription(parsedResult: unknown): string {
  const req = getRequirement(parsedResult);
  const passport = req?.passport ?? "?";
  const destination = req?.destination ?? "?";
  const status = req?.status ?? "unknown";
  return `User is reviewing visa requirements for ${passport} → ${destination} (status: ${status}).`;
}

export function CheckVisaToolCall({
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
      renderBody={renderVisaBody}
      reviewingDescription={visaDescription}
    />
  );
}
