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
    <div className="bg-secondary flex w-full flex-row items-center gap-1.5 border-b border-(--border-soft) px-3 py-2 md:h-full md:w-13.5 md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3">
      <div className="bg-primary grid h-7.5 w-7.5 place-items-center rounded-lg text-sm font-bold text-white md:mb-2.5">
        A
      </div>
      <button
        type="button"
        aria-label="New thread"
        onClick={onNewThread}
        className="text-muted-foreground hover:bg-muted hover:text-foreground grid h-8.5 w-8.5 place-items-center rounded-lg"
      >
        <PencilIcon className="size-4" />
      </button>
      <Link
        href={SETTINGS_PATH}
        aria-label="Settings"
        aria-current={settingsActive ? "page" : undefined}
        className={cn(
          "hover:bg-muted hover:text-foreground ml-auto grid h-8.5 w-8.5 place-items-center rounded-lg md:mt-auto md:ml-0",
          settingsActive ? "bg-muted text-foreground" : "text-muted-foreground",
        )}
      >
        <SettingsIcon className="size-4" />
      </Link>
      <div className="h-2.5 w-2.5 rounded-full bg-(--success)" />
    </div>
  );
}
