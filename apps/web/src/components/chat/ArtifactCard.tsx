"use client";

import type { ArtifactView } from "./artifact";

export function ArtifactCard({ view, onOpen }: { view: ArtifactView; onOpen: () => void }) {
  const peek = view.content.split("\n").slice(0, 6).join("\n");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="my-3 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left hover:border-[var(--page-color,var(--accent))]"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--border-soft)] px-3.5 py-2.5">
        <span style={{ color: "var(--page-color,var(--accent))" }}>▤</span>
        <span className="text-[13.5px] font-semibold text-[var(--ink)]">{view.title}</span>
        <span className="ml-auto text-[var(--ink-mute)]">⤢</span>
      </div>
      <pre className="max-h-[140px] overflow-hidden bg-[var(--surface-soft)] px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[var(--ink-soft)]">
        {peek}
      </pre>
    </button>
  );
}
