import { describe, expect, it } from "vitest";
import { AGENT_ORDER, getAgentConfig, isAgentId } from "./registry";

describe("agent registry", () => {
  it("lists the five agents in display order", () => {
    expect(AGENT_ORDER).toEqual(["travel", "grocery", "fitness", "wellness", "a2ui"]);
  });

  it("narrows valid agent ids", () => {
    expect(isAgentId("travel")).toBe(true);
    expect(isAgentId("nope")).toBe(false);
  });

  it("returns config for a known agent", () => {
    const cfg = getAgentConfig("travel");
    expect(cfg.label).toBe("Trip Studio");
    expect(cfg.colorVar).toBe("--travel");
    expect(cfg.artifact?.stateField).toBe("itinerary");
  });

  it("falls back to travel for unknown ids", () => {
    expect(getAgentConfig("nope").id).toBe("travel");
  });
});
