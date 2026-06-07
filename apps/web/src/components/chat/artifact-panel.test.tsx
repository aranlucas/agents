import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { ArtifactPanel } from "./ArtifactPanel";

const view = {
  title: "Itinerary",
  kind: "markdown" as const,
  content: "# Day 1",
  status: "drafting",
  version: 2,
};
const render = (n: ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(n);
  });
  return r;
};

describe("ArtifactPanel", () => {
  it("renders title, version and content", () => {
    const s = JSON.stringify(
      render(
        <ArtifactPanel view={view} fullscreen={false} onClose={() => {}} onToggleFullscreen={() => {}} />,
      ).toJSON(),
    );
    expect(s).toContain("Itinerary");
    expect(s).toContain("v2");
    expect(s).toContain("Day 1");
  });

  it("fires onClose from the single header close button", () => {
    const onClose = vi.fn();
    const r = render(
      <ArtifactPanel view={view} fullscreen={false} onClose={onClose} onToggleFullscreen={() => {}} />,
    );
    const close = r.root
      .findAll((n) => n.type === "button")
      .find((b) => b.props["aria-label"] === "Close artifact");
    act(() => close!.props.onClick());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
