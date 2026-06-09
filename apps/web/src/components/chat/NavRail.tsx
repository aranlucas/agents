"use client";

import Link from "next/link";
import { PencilIcon, SettingsIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const SETTINGS_PATH = "/console/settings";

// Horizontal mobile menu bar on small screens; vertical rail on md+. The order
// utilities flip the trailing items (settings + status dot) to the trailing edge
// (right on mobile, bottom on desktop) so the same markup serves both axes.
export function NavRail({
  onNewThread,
  activePath,
}: {
  onNewThread?: () => void;
  activePath?: string;
}) {
  const settingsActive = activePath === SETTINGS_PATH;
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
      <Link
        href={SETTINGS_PATH}
        aria-label="Settings"
        aria-current={settingsActive ? "page" : undefined}
        className={cn(
          "ml-auto grid h-[34px] w-[34px] place-items-center rounded-lg hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] md:mt-auto md:ml-0",
          settingsActive ? "bg-[var(--bg-soft)] text-[var(--ink)]" : "text-[var(--ink-mute)]",
        )}
      >
        <SettingsIcon className="size-4" />
      </Link>
      <div className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
    </div>
  );
}
