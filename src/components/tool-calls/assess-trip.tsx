"use client";

import { formatMoney } from "../mcp-tool-call/format";
import { toRecord } from "../mcp-tool-call/payload";
import { SingleResultToolCall } from "./single-result-tool-call";
import type { ToolStatus } from "../mcp-tool-call/types";

interface ViabilityCheck {
  dimension: string;
  status: string;
  summary: string;
  cost?: number;
  currency?: string;
}

interface AssessResult {
  verdict: string;
  reason: string;
  checks?: ViabilityCheck[];
  total_cost?: number;
  currency?: string;
  nights?: number;
}

const VERDICT_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  viable: { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700" },
  borderline: { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700" },
  infeasible: { border: "border-red-300", bg: "bg-red-50", text: "text-red-700" },
};

const CHECK_STATUS_ICON: Record<string, string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
};

const CHECK_STATUS_COLOR: Record<string, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
};

function renderAssessBody(parsedResult: unknown) {
  const record = toRecord(parsedResult);
  if (!record) return null;
  const data = record as unknown as AssessResult;
  const verdict = data.verdict ?? "unknown";
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.borderline;

  return (
    <div className="space-y-3">
      <div className={`rounded-md border p-3 ${style.border} ${style.bg}`}>
        <div className={`text-[0.62rem] uppercase tracking-[0.14em] font-semibold ${style.text}`}>
          {verdict.toUpperCase()}
        </div>
        {data.total_cost != null && (
          <div className="mt-1 text-lg font-bold text-slate-900">
            {formatMoney(data.total_cost, data.currency ?? "")}
            {data.nights != null && (
              <span className="ml-2 text-sm font-normal text-slate-500">· {data.nights} nights</span>
            )}
          </div>
        )}
        {data.reason && (
          <div className="mt-1 text-xs leading-5 text-slate-700">{data.reason}</div>
        )}
      </div>

      {(data.checks ?? []).length > 0 && (
        <div className="grid gap-1.5">
          {(data.checks ?? []).map((check, i) => {
            const icon = CHECK_STATUS_ICON[check.status] ?? "·";
            const color = CHECK_STATUS_COLOR[check.status] ?? "text-slate-500";
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5"
              >
                <span className={`mt-px shrink-0 text-xs font-bold ${color}`}>{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">{check.dimension}</span>
                    {check.cost != null && (
                      <span className="shrink-0 text-xs text-emerald-700">
                        {formatMoney(check.cost, check.currency ?? "")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">{check.summary}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function assessDescription(parsedResult: unknown): string {
  const record = toRecord(parsedResult);
  const verdict = typeof record?.verdict === "string" ? record.verdict : "unknown";
  return `User is currently reviewing trip viability assessment (verdict: ${verdict}).`;
}

export function AssessTripToolCall({
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
      renderBody={renderAssessBody}
      reviewingDescription={assessDescription}
    />
  );
}
