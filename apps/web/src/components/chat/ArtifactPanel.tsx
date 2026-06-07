"use client";

import { Streamdown } from "streamdown";
import type { ArtifactView } from "./artifact";

export function ArtifactPanel({
  view,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  view: ArtifactView;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 flex-none items-center gap-2.5 border-b border-[var(--border-soft)] px-4">
          <span style={{ color: "var(--page-color,var(--accent))" }}>▤</span>
          <span className="text-sm font-semibold text-[var(--ink)]">{view.title}</span>
          <span className="font-mono text-[10px] text-[var(--ink-mute)]">
            {`v${view.version} · ${view.status}`}
          </span>
          <button
            type="button"
            aria-label="Close artifact"
            onClick={onClose}
            className="ml-auto grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--border-soft)] text-[var(--ink-mute)] hover:text-[var(--ink)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--surface)] px-5 py-4">
          <Streamdown>{view.content}</Streamdown>
        </div>
      </div>
      <div className="flex w-12 flex-none flex-col items-center gap-1 border-l border-[var(--border-soft)] bg-[var(--surface-soft)] py-2.5">
        <button
          type="button"
          aria-label="Toggle fullscreen"
          onClick={onToggleFullscreen}
          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--ink-mute)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]"
        >
          {fullscreen ? "⤡" : "⤢"}
        </button>
        {/* run/undo/redo/copy/versions land in Milestone 2 once ADK artifacts exist */}
      </div>
    </div>
  );
}
