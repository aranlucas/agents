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
    <div className="flex h-screen overflow-hidden">
      <div className={cn("flex-none", fullscreen && "hidden")}>{rail}</div>
      <div className={cn("flex min-w-0 flex-1 flex-col", fullscreen && "hidden")}>{chat}</div>
      {hasArtifact && (
        <div
          className={cn(
            "flex-none overflow-hidden border-l border-[var(--border)] transition-[width] duration-300",
            fullscreen ? "w-full" : open ? "w-[48%]" : "w-0",
          )}
        >
          {artifact}
        </div>
      )}
    </div>
  );
}
