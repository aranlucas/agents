import { describe, expect, it } from "vitest";
import { AGENT_BACKEND_PATHS, AGENT_ORDER, getAgentConfig, isAgentId } from "./registry";

describe("agent registry", () => {
  it("lists all agents in display order", () => {
    expect(AGENT_ORDER).toEqual([
      "travel",
      "grocery",
      "fitness",
      "wellness",
      "expense",
      "oral-boards",
      "oral-boards-v2",
      "a2ui",
      "resume",
      "research",
      "spreadsheet",
      "presentation",
    ]);
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

  it("uses canonical backend paths for gateway routes", () => {
    expect(AGENT_BACKEND_PATHS.expense).toBe("expense");
    expect(AGENT_BACKEND_PATHS["oral-boards"]).toBe("oralboards");
    expect(AGENT_BACKEND_PATHS.resume).toBe("resume");
  });

  it("returns undefined for unknown ids", () => {
    expect(getAgentConfig("nope")).toBeUndefined();
  });

  it("declares external-account requirements per agent", () => {
    expect(getAgentConfig("travel").requires ?? []).toEqual([]);
    expect(getAgentConfig("grocery").requires).toEqual(["kroger"]);
    expect(getAgentConfig("fitness").requires).toEqual(["strava"]);
    expect(getAgentConfig("wellness").requires).toEqual(["kroger", "strava"]);
    expect(getAgentConfig("expense").requires ?? []).toEqual([]);
    expect(getAgentConfig("oral-boards").requires ?? []).toEqual([]);
    expect(getAgentConfig("oral-boards-v2").requires ?? []).toEqual([]);
    expect(getAgentConfig("a2ui").requires ?? []).toEqual([]);
    expect(getAgentConfig("resume").requires ?? []).toEqual([]);
    expect(getAgentConfig("research").requires ?? []).toEqual([]);
    expect(getAgentConfig("spreadsheet").requires ?? []).toEqual([]);
    expect(getAgentConfig("presentation").requires ?? []).toEqual([]);
  });
});
