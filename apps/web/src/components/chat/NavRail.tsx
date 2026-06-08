"use client";

import { PencilIcon } from "lucide-react";

// Horizontal mobile menu bar on small screens; vertical rail on md+. The order
// utilities flip the status dot to the trailing edge (right on mobile, bottom
// on desktop) so the same markup serves both axes.
export function NavRail({ onNewThread }: { onNewThread?: () => void }) {
  return (
    <div className="flex w-full flex-row items-center gap-1.5 border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 md:h-full md:w-[54px] md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3">
      <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white md:mb-2.5">
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
      <div className="ml-auto h-2.5 w-2.5 rounded-full bg-[var(--success)] md:mt-auto md:ml-0" />
    </div>
  );
}
