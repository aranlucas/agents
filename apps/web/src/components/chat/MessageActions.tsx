"use client";

import { useCallback } from "react";

export function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(text);
  }, [text]);
  return (
    <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] text-[var(--ink-mute)] hover:text-[var(--ink)]"
      >
        ⧉ copy
      </button>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] text-[var(--ink-mute)] hover:text-[var(--ink)]"
        >
          ↻ retry
        </button>
      )}
    </div>
  );
}
