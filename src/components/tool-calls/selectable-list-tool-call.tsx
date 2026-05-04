"use client";

import { useMemo, useState } from "react";
import { buildInputChips } from "../mcp-tool-call/summaries";
import { getError, toRecord, unwrapResult } from "../mcp-tool-call/payload";
import { formatPayload } from "../mcp-tool-call/format";
import { getToolMeta, TONE_CLASSES } from "../mcp-tool-call/tool-meta";
import type { ToolStatus } from "../mcp-tool-call/types";
import { ReviewingToolContext, SelectedItemContext } from "./tool-context";

export interface ItemSummary {
  title: string;
  subtitle?: string;
  detail?: string;
  price?: string;
}

export interface SelectableListToolCallProps<TItem> {
  status: ToolStatus;
  name: string;
  args?: unknown;
  result?: unknown;
  extractItems: (result: unknown) => TItem[];
  itemKey: (item: TItem, index: number) => string;
  itemSummary: (item: TItem) => ItemSummary;
  selectionLabel: (item: TItem) => string;
}

export function SelectableListToolCall<TItem>({
  status,
  name,
  args,
  result,
  extractItems,
  itemKey,
  itemSummary,
  selectionLabel,
}: SelectableListToolCallProps<TItem>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const meta = getToolMeta(name);
  const parsedArgs = useMemo(() => toRecord(args), [args]);
  const parsedResult = useMemo(() => unwrapResult(result), [result]);
  const running = status === "inProgress" || status === "executing";
  const error = getError(parsedResult);
  const chips = buildInputChips(parsedArgs);

  const items = useMemo(() => {
    if (status !== "complete") return [];
    try {
      return extractItems(parsedResult);
    } catch {
      return [];
    }
  }, [status, parsedResult, extractItems]);

  const selectedIndex = selectedKey
    ? items.findIndex((item, i) => itemKey(item, i) === selectedKey)
    : -1;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  function toggleItem(key: string) {
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  const hasBody = running || error || items.length > 0;

  return (
    <section className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {isExpanded && !running && (
        <ReviewingToolContext toolName={name} label={meta.label} args={args} />
      )}
      {selectedItem && (
        <SelectedItemContext
          toolName={name}
          label={meta.label}
          item={{ label: selectionLabel(selectedItem), data: selectedItem }}
        />
      )}

      <button
        type="button"
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50"
        onClick={() => setIsExpanded((open) => !open)}
      >
        <StatusMark running={running} complete={status === "complete"} error={Boolean(error)} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] ${TONE_CLASSES[meta.tone]}`}
            >
              {meta.category}
            </span>
            <span className="truncate text-sm font-semibold text-slate-900">{meta.label}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {chips.slice(0, 5).map((chip) => (
              <span
                key={chip}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.68rem] text-slate-600"
              >
                {chip}
              </span>
            ))}
          </span>
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-slate-400">
          {running ? "Running" : error ? "Error" : items.length > 0 ? `${items.length} results` : "Done"}
        </span>
      </button>

      {(isExpanded || hasBody) && (
        <div className="border-t border-slate-200 bg-slate-50/60 px-3 pb-3 pt-3">
          {running && (
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400" />
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
              {error}
            </div>
          )}

          {items.length > 0 && (
            <div className="grid gap-1.5">
              {items.map((item, index) => {
                const key = itemKey(item, index);
                const summary = itemSummary(item);
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleItem(key)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-sky-300 bg-sky-50 ring-1 ring-sky-200"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {summary.title}
                        </div>
                        {summary.subtitle && (
                          <div className="mt-0.5 text-xs text-slate-500">{summary.subtitle}</div>
                        )}
                      </div>
                      {summary.price && (
                        <div className="shrink-0 text-sm font-semibold text-emerald-700">
                          {summary.price}
                        </div>
                      )}
                    </div>
                    {summary.detail && (
                      <div className="mt-1.5 text-xs leading-5 text-slate-600">{summary.detail}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {isExpanded && (
            <div className="mt-3">
              <button
                type="button"
                className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400 transition-colors hover:text-slate-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowJson((s) => !s);
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

function StatusMark({
  running,
  complete,
  error,
}: {
  running: boolean;
  complete: boolean;
  error: boolean;
}) {
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
      <div className="mb-1 text-[0.62rem] uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <pre className="max-h-[260px] overflow-auto rounded-md border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-700">
        {formatPayload(value)}
      </pre>
    </div>
  );
}
