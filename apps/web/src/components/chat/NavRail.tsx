"use client";

import { PencilIcon } from "lucide-react";

export function NavRail({ onNewThread }: { onNewThread?: () => void }) {
  return (
    <div className="flex h-full w-[54px] flex-col items-center gap-1.5 border-r border-[var(--border-soft)] bg-[var(--surface-soft)] py-3">
      <div className="mb-2.5 grid h-[30px] w-[30px] place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
        A
      </div>
      <button
        type="button"
        aria-label="New thread"
        onClick={onNewThread}
        className="grid h-[34px] w-[34px] place-items-center rounded-lg text-[var(--ink-mute)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]"
      >
        <PencilIcon className="size-4" />
      </button>
      <div className="mt-auto h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
    </div>
  );
}
