"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelState = "closed" | "split" | "fullscreen";
export type PanelAction = "open" | "close" | "toggle-open" | "toggle-fullscreen";

export function nextPanelState(state: PanelState, action: PanelAction): PanelState {
  switch (action) {
    case "open":
      return "split";
    case "close":
      return "closed";
    case "toggle-open":
      return state === "closed" ? "split" : "closed";
    case "toggle-fullscreen":
      return state === "fullscreen" ? "split" : "fullscreen";
  }
}

const STORAGE_PREFIX = "agents-artifact-panel:";

export function useArtifactPanel(agentId: string) {
  const [state, setState] = useState<PanelState>("closed");
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + agentId);
    setState(stored === "split" || stored === "fullscreen" ? (stored as PanelState) : "closed");
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
  rail,
  chat,
  artifact,
  hasArtifact,
  panelState,
}: {
  rail: ReactNode;
  chat: ReactNode;
  artifact: ReactNode;
  hasArtifact: boolean;
  panelState: PanelState;
}) {
  const open = panelState !== "closed";
  const fullscreen = panelState === "fullscreen";
  return (
    // Stacks vertically on mobile (top bar over content), splits into columns on
    // md+. `h-dvh` tracks the dynamic viewport so mobile browser chrome doesn't
    // clip the layout the way `h-screen`/100vh does.
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* Rail: top menu bar on mobile, left rail on desktop. Hidden on desktop
          fullscreen, and on mobile whenever the artifact takes over the screen. */}
      <div className={cn("flex-none", fullscreen && "md:hidden", open && "max-md:hidden")}>
        {rail}
      </div>
      {/* Chat: hidden on desktop fullscreen, and on mobile when the artifact is open. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          fullscreen && "md:hidden",
          open && "max-md:hidden",
        )}
      >
        {chat}
      </div>
      {hasArtifact && (
        <div
          className={cn(
            "overflow-hidden border-[var(--border)]",
            // Mobile: full-screen takeover when open, removed when closed.
            open ? "max-md:flex max-md:flex-1" : "max-md:hidden",
            // Desktop: animated side panel that widens from the right edge.
            "md:flex-none md:border-l md:transition-[width] md:duration-300",
            fullscreen ? "md:w-full" : open ? "md:w-[48%]" : "md:w-0",
          )}
        >
          {artifact}
        </div>
      )}
    </div>
  );
}
