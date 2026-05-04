"use client";

import {
  useAgent,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { useMemo, useState } from "react";
import { buildInputChips } from "../mcp-tool-call/summaries";
import { getError, toRecord, unwrapResult } from "../mcp-tool-call/payload";
import { formatPayload } from "../mcp-tool-call/format";
import { getToolMeta, TONE_CLASSES } from "../mcp-tool-call/tool-meta";
import type { ToolStatus } from "../mcp-tool-call/types";
import { ReviewingToolContext } from "./tool-context";

export interface SingleResultToolCallProps {
  status: ToolStatus;
  name: string;
  args?: unknown;
  result?: unknown;
  renderBody: (parsedResult: unknown) => React.ReactNode;
  reviewingDescription?: (parsedResult: unknown) => string;
}

export function SingleResultToolCall({
  status,
  name,
  args,
  result,
  renderBody,
  reviewingDescription,
}: SingleResultToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const { agent } = useAgent({
    agentId: "my_agent",
    updates: [UseAgentUpdate.OnStateChanged],
  });

  const meta = getToolMeta(name);
  const parsedArgs = useMemo(() => toRecord(args), [args]);
  const liveState = (agent?.state ?? {}) as Record<string, unknown>;
  const liveStateResult = name ? liveState[name] : undefined;
  const displayResult = liveStateResult ?? result;
  const parsedResult = useMemo(() => unwrapResult(displayResult), [displayResult]);
  const running = status === "inProgress" || status === "executing";
  const error = getError(parsedResult);
  const chips = buildInputChips(parsedArgs);

  const hasResult = !running && displayResult != null;
  const hasBody = running || error || hasResult;

  const contextDesc =
    reviewingDescription && hasResult
      ? reviewingDescription(parsedResult)
      : undefined;

  return (
    <section className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {isExpanded && contextDesc && (
        <ReviewingToolContext
          toolName={name}
          label={meta.label}
          args={args}
          description={contextDesc}
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
          {running ? "Running" : error ? "Error" : "Done"}
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

          {hasResult && !error && renderBody(parsedResult)}

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
                  {status === "complete" && <PayloadBlock title="Result" value={displayResult} />}
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
