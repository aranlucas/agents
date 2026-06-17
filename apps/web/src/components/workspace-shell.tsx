"use client";

import { useState, type ReactNode } from "react";
import { cn, SidebarTrigger } from "@agents/ui";

export type { PanelState, PanelAction } from "./workspace-shell-utils";
import type { PanelState, PanelAction } from "./workspace-shell-utils";
import { nextPanelState } from "./workspace-shell-utils";

const STORAGE_PREFIX = "agents-artifact-panel:";

export function useArtifactPanel(agentId: string) {
  const [, forceUpdate] = useState(0);
  const key = STORAGE_PREFIX + agentId;
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  const state: PanelState = stored === "split" ? "split" : "closed";
  const dispatch = (action: PanelAction) => {
    const next = nextPanelState(state, action);
    window.localStorage.setItem(key, next);
    forceUpdate((n) => n + 1);
  };
  return { state, dispatch };
}

export function WorkspaceShell({
  chat,
  artifact,
  hasArtifact,
  panelState,
}: {
  chat: ReactNode;
  artifact: ReactNode;
  hasArtifact: boolean;
  panelState: PanelState;
}) {
  const open = panelState !== "closed";
  return (
    // Height comes from the parent SidebarInset; overflow-hidden clips panels.
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      {/* Chat column: mobile trigger bar on top, chat content below */}
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", open && "max-md:hidden")}>
        {/* Mobile-only top bar with sidebar trigger */}
        <div className="flex shrink-0 items-center border-b px-2 py-1.5 md:hidden">
          <SidebarTrigger />
        </div>
        {chat}
      </div>
      {hasArtifact && (
        <div
          className={cn(
            "border-border overflow-hidden",
            // Mobile: full-screen takeover when open, removed when closed.
            open ? "max-md:flex max-md:flex-1" : "max-md:hidden",
            // Desktop: animated side panel that widens from the right edge.
            "md:flex-none md:border-l md:transition-[width] md:duration-300",
            open ? "md:w-[48%]" : "md:w-0",
          )}
        >
          {artifact}
        </div>
      )}
    </div>
  );
}
