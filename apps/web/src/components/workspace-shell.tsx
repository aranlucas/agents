"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@agents/ui/lib/utils";
import { SidebarTrigger } from "@agents/ui";

export type { PanelState, PanelAction } from "./workspace-shell-utils";
import type { PanelState, PanelAction } from "./workspace-shell-utils";
import { nextPanelState } from "./workspace-shell-utils";

const STORAGE_PREFIX = "agents-artifact-panel:";
const PANEL_CHANGE_EVENT = "agents-artifact-panel-change";

function readPanelState(key: string): PanelState {
  return window.localStorage.getItem(key) === "split" ? "split" : "closed";
}

function getServerPanelState(): PanelState {
  return "closed";
}

export function useArtifactPanel(agentId: string) {
  const key = STORAGE_PREFIX + agentId;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === key) onStoreChange();
      };
      const handleLocalChange = (event: Event) => {
        if (event instanceof CustomEvent && event.detail === key) onStoreChange();
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(PANEL_CHANGE_EVENT, handleLocalChange);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(PANEL_CHANGE_EVENT, handleLocalChange);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => readPanelState(key), [key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerPanelState);

  const dispatch = useCallback(
    (action: PanelAction) => {
      const next = nextPanelState(readPanelState(key), action);
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new CustomEvent(PANEL_CHANGE_EVENT, { detail: key }));
    },
    [key],
  );

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
