import { describe, expect, it } from "vitest";
import { nextPanelState } from "./workspace-shell";

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
