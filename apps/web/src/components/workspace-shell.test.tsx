import { act, render, waitFor } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agents/ui", () => ({
  SidebarTrigger: () => null,
}));

import { nextPanelState } from "./workspace-shell-utils";
import { useArtifactPanel, WorkspaceShell } from "./workspace-shell";

const HYDRATION_AGENT_ID = "hydration-regression";
const HYDRATION_STORAGE_KEY = `agents-artifact-panel:${HYDRATION_AGENT_ID}`;

function StoredPanelHarness() {
  const panel = useArtifactPanel(HYDRATION_AGENT_ID);
  return (
    <WorkspaceShell
      topBar={<div>TOP BAR</div>}
      hasArtifact
      panelState={panel.state}
      chat={<div data-testid="chat">CHAT_MARKER</div>}
      artifact={<div data-testid="artifact">ARTIFACT_MARKER</div>}
    />
  );
}

describe("useArtifactPanel hydration", () => {
  it("hydrates from a closed server snapshot before restoring stored split state", async () => {
    window.localStorage.setItem(HYDRATION_STORAGE_KEY, "split");
    const container = document.createElement("div");
    document.body.append(container);
    let root: Root | undefined;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];

    try {
      container.innerHTML = renderToString(<StoredPanelHarness />);
      const serverChatColumn = container.querySelector('[data-testid="chat"]')?.parentElement;
      expect(serverChatColumn).not.toBeNull();
      expect(serverChatColumn?.classList.contains("max-md:hidden")).toBe(false);

      await act(async () => {
        root = hydrateRoot(container, <StoredPanelHarness />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      await waitFor(() => {
        const chatColumn = container.querySelector('[data-testid="chat"]')?.parentElement;
        const artifactPanel = container.querySelector('[data-testid="artifact"]')?.parentElement;
        expect(chatColumn).toHaveClass("max-md:hidden");
        expect(artifactPanel).toHaveClass("max-md:flex", "md:w-[48%]");
      });

      expect(recoverableErrors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      consoleError.mockRestore();
      container.remove();
      window.localStorage.removeItem(HYDRATION_STORAGE_KEY);
    }
  });
});

describe("WorkspaceShell layout invariants", () => {
  // Regression guard for the mobile scroll bug: in the mobile flex-col layout the
  // chat column's flex-1 is on the main (vertical) axis, so it must carry `min-h-0`
  // to shrink below its content height. Without it the column overflows the bounded
  // `h-dvh` root, the root's `overflow-hidden` clips it, and the inner conversation
  // has no room to scroll. Desktop (cross-axis height) was unaffected — but the fix
  // must not regress, hence this assertion.
  it("gives the chat column min-h-0 so the conversation can scroll on mobile", () => {
    const { container } = render(
      <WorkspaceShell
        topBar={<div>TOP BAR</div>}
        hasArtifact={false}
        panelState="closed"
        chat={<span>CHAT_MARKER</span>}
        artifact={<span>ARTIFACT_MARKER</span>}
      />,
    );
    const chatColumn = container.querySelector('[class*="min-h-0"]')!;
    const classes = Array.from(chatColumn.classList);

    expect(classes).toContain("min-h-0");
    expect(classes).toContain("flex-1");
    expect(classes).toContain("flex-col");
  });

  // The min-h-0 fix only matters because an ancestor bounds the height and clips
  // overflow; if that scroll model changes, revisit the chat column constraint.
  // The shell root uses h-full (height comes from the parent SidebarInset) and
  // clips overflow.
  it("bounds the shell height and clips overflow at the root", () => {
    const { container } = render(
      <WorkspaceShell
        topBar={<div>TOP BAR</div>}
        hasArtifact={false}
        panelState="closed"
        chat={<span>CHAT_MARKER</span>}
        artifact={<span>ARTIFACT_MARKER</span>}
      />,
    );
    const root = container.firstElementChild!;
    expect(root.classList.contains("h-full")).toBe(true);
    expect(root.classList.contains("overflow-hidden")).toBe(true);
  });
});

describe("nextPanelState", () => {
  it("toggle-open toggles between split and closed", () => {
    expect(nextPanelState("closed", "toggle-open")).toBe("split");
    expect(nextPanelState("split", "toggle-open")).toBe("closed");
  });
  it("open action forces split, close forces closed", () => {
    expect(nextPanelState("closed", "open")).toBe("split");
    expect(nextPanelState("split", "close")).toBe("closed");
  });
});
