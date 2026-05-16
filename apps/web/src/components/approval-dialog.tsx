"use client";

import React, { useEffect } from "react";

export interface ApprovalRequest {
  id: string;
  action: string;
  reason: string;
  resolve: (decision: { approved: boolean; note?: string }) => void;
}

interface Props {
  request: ApprovalRequest;
}

export function ApprovalDialog({ request }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") request.resolve({ approved: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-[var(--accent-strong)]"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--ink)]">
              Approve before continuing
            </h3>
            <p className="text-xs text-[var(--ink-mute)] mt-0.5">
              The agent paused and is waiting on you.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border-soft)] px-4 py-3 mb-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] mb-1 font-mono">
            Proposed action
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            {request.action}
          </div>
        </div>

        {request.reason && (
          <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border-soft)] px-4 py-3 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] mb-1 font-mono">
              Why
            </div>
            <div className="text-sm text-[var(--ink-soft)]">
              {request.reason}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              request.resolve({ approved: false, note: "rejected by user" })
            }
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] transition"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => request.resolve({ approved: true })}
            className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-strong)] transition"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
