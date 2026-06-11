import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextPanelState, WorkspaceShell } from "./workspace-shell";

// Returns the class list of the element that directly wraps the given marker child.
function classesWrapping(markup: string, marker: string): string[] {
  const match = markup.match(new RegExp(`class="([^"]*)"[^>]*>(?:<[^>]+>)*${marker}`));
  if (!match) throw new Error(`could not find element wrapping ${marker}`);
  return match[1].split(/\s+/);
}

describe("WorkspaceShell layout invariants", () => {
  const markup = renderToStaticMarkup(
    <WorkspaceShell
      hasArtifact={false}
      panelState="closed"
      rail={<span>RAIL_MARKER</span>}
      chat={<span>CHAT_MARKER</span>}
      artifact={<span>ARTIFACT_MARKER</span>}
    />,
  );

  // Regression guard for the mobile scroll bug: in the mobile flex-col layout the
  // chat column's flex-1 is on the main (vertical) axis, so it must carry `min-h-0`
  // to shrink below its content height. Without it the column overflows the bounded
  // `h-dvh` root, the root's `overflow-hidden` clips it, and the inner conversation
  // has no room to scroll. Desktop (cross-axis height) was unaffected — but the fix
  // must not regress, hence this assertion.
  it("gives the chat column min-h-0 so the conversation can scroll on mobile", () => {
    const classes = classesWrapping(markup, "CHAT_MARKER");
    expect(classes).toContain("min-h-0");
    expect(classes).toContain("flex-1");
    expect(classes).toContain("flex-col");
  });

  // The min-h-0 fix only matters because an ancestor bounds the height and clips
  // overflow; if that scroll model changes, revisit the chat column constraint.
  it("bounds the shell height and clips overflow at the root", () => {
    expect(markup).toContain("h-dvh");
    expect(markup).toContain("overflow-hidden");
  });
});

describe("nextPanelState", () => {
  it("open toggles between split and closed", () => {
    expect(nextPanelState("closed", "toggle-open")).toBe("split");
    expect(nextPanelState("split", "toggle-open")).toBe("closed");
    expect(nextPanelState("fullscreen", "toggle-open")).toBe("closed");
  });
  it("fullscreen toggles between fullscreen and split, and opens if closed", () => {
    expect(nextPanelState("closed", "toggle-fullscreen")).toBe("fullscreen");
    expect(nextPanelState("split", "toggle-fullscreen")).toBe("fullscreen");
    expect(nextPanelState("fullscreen", "toggle-fullscreen")).toBe("split");
  });
  it("open action forces split, close forces closed", () => {
    expect(nextPanelState("closed", "open")).toBe("split");
    expect(nextPanelState("fullscreen", "close")).toBe("closed");
  });
});
