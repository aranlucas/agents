import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agents/ui", () => ({
  SidebarTrigger: () => null,
}));

import { nextPanelState } from "./workspace-shell-utils";
import { WorkspaceShell } from "./workspace-shell";

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
