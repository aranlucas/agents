import { describe, expect, it } from "vitest";
import { selectArtifact } from "./artifact";
import { getAgentConfig } from "./agents/registry";

const travel = getAgentConfig("travel");

describe("selectArtifact", () => {
  it("returns null when the state field is empty", () => {
    expect(selectArtifact({ itinerary: "" }, travel)).toBeNull();
  });

  it("builds a view from the state field + registry", () => {
    const view = selectArtifact({ itinerary: "# Day 1", status: "drafting" }, travel);
    expect(view).toEqual({
      title: "Itinerary",
      kind: "markdown",
      content: "# Day 1",
      status: "drafting",
      version: 1,
    });
  });

  it("joins array content (list artifacts) with newlines", () => {
    const grocery = getAgentConfig("grocery");
    const view = selectArtifact({ shopping_list: ["milk", "eggs"], status: "ready" }, grocery);
    expect(view?.content).toBe("milk\neggs");
  });

  it("prefers an explicit artifact ref version when present (Milestone 2 forward-compat)", () => {
    const view = selectArtifact(
      { itinerary: "# Day 1", artifact: { version: 4, status: "ready" } },
      travel,
    );
    expect(view?.version).toBe(4);
    expect(view?.status).toBe("ready");
  });

  it("returns null for an agent with no artifact config", () => {
    expect(selectArtifact({ foo: "bar" }, getAgentConfig("trends"))).toBeNull();
  });

  it("builds a view for oral-boards from the case field (bespoke pane also reads state directly)", () => {
    const oralBoards = getAgentConfig("oral-boards");
    const view = selectArtifact(
      { case: "## Case\nA 7-year-old patient.", status: "drafting" },
      oralBoards,
    );
    expect(view).toEqual({
      title: "Case",
      kind: "markdown",
      content: "## Case\nA 7-year-old patient.",
      status: "drafting",
      version: 1,
    });
  });
});
