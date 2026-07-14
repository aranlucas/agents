import { describe, expect, it } from "vitest";
import {
  AGENT_BACKEND_PATHS,
  AGENT_ORDER,
  getAgentConfig,
  isAgentId,
  isConsoleAgentId,
} from "./registry";

describe("agent registry", () => {
  it("uses the Go fitness training_plan state field", () => {
    expect(getAgentConfig("fitness").artifact?.stateField).toBe("training_plan");
  });
  it("lists all agents in display order", () => {
    expect(AGENT_ORDER).toEqual([
      "travel",
      "grocery",
      "fitness",
      "wellness",
      "expense",
      "oral-boards",
      "trends",
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

  it("keeps oral boards on its specialized route", () => {
    expect(isConsoleAgentId("travel")).toBe(true);
    expect(isConsoleAgentId("oral-boards")).toBe(false);
    expect(isConsoleAgentId("nope")).toBe(false);
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

  it("declares the two agents that require Kroger", () => {
    expect(AGENT_ORDER.filter((id) => getAgentConfig(id).requiresKroger)).toEqual([
      "grocery",
      "wellness",
    ]);
  });

  it("surfaces Trends state through a native analysis artifact", () => {
    expect(getAgentConfig("trends").artifact).toMatchObject({
      stateField: "query",
      kind: "document",
      title: "Trends analysis",
    });
  });

  it("surfaces the Resume role-fit summary as a document artifact", () => {
    expect(getAgentConfig("resume").artifact).toMatchObject({
      stateField: "fit_summary",
      kind: "document",
      title: "Role fit brief",
    });
  });

  it("frames Resume suggestions around the personal-agent story", () => {
    const resume = getAgentConfig("resume");

    expect(resume.placeholder).toBe("Ask about Lucas…");
    expect(resume.welcome).toContain("personal agents");
  });
});
