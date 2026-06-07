import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { ToolEvent, toolEventLabel } from "./ToolEvent";

const render = (n: ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(n);
  });
  return JSON.stringify(r.toJSON());
};

describe("toolEventLabel", () => {
  it("maps known tool names to friendly labels", () => {
    expect(toolEventLabel("write_itinerary")).toBe("Updating the itinerary");
    expect(toolEventLabel("search_flights")).toBe("Checking travel options");
    expect(toolEventLabel("totally_unknown")).toBe("Agent used a tool");
  });
});

describe("ToolEvent", () => {
  it("shows a running badge while executing", () => {
    expect(render(<ToolEvent name="write_itinerary" status="executing" />)).toContain("running");
  });
  it("shows a done badge when complete", () => {
    expect(render(<ToolEvent name="write_itinerary" status="complete" result="ok" />)).toContain("done");
  });
});
