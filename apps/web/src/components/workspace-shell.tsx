"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@agents/ui/lib/utils";
import { SidebarTrigger } from "@agents/ui";

export type PanelState = "closed" | "split";
export type PanelAction = "open" | "close" | "toggle-open";

export function nextPanelState(state: PanelState, action: PanelAction): PanelState {
  switch (action) {
    case "open":
      return "split";
    case "close":
      return "closed";
    case "toggle-open":
      return state === "closed" ? "split" : "closed";
    default:
      return state;
  }
}

const STORAGE_PREFIX = "agents-artifact-panel:";

export function useArtifactPanel(agentId: string) {
  const [state, setState] = useState<PanelState>("closed");
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + agentId);
    setState(stored === "split" ? "split" : "closed");
  }, [agentId]);
  const dispatch = (action: PanelAction) =>
    setState((s) => {
      const next = nextPanelState(s, action);
      window.localStorage.setItem(STORAGE_PREFIX + agentId, next);
      return next;
    });
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
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          open && "max-md:hidden",
        )}
      >
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
