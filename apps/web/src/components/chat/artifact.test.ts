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
    expect(selectArtifact({ foo: "bar" }, getAgentConfig("a2ui"))).toBeNull();
  });

  it("composes oral-boards case, provenance, transcript, and score card", () => {
    const oralBoards = getAgentConfig("oral-boards");
    const view = selectArtifact(
      {
        case: "## Case\nA 7-year-old patient.",
        case_sources: [{ docid: 1, title: "OCE Guide", collection: "abpd" }],
        transcript: [
          {
            question: "What is your diagnosis?",
            answer: "Pulpitis",
            feedback: "Support the diagnosis with guideline criteria.",
            citations: [{ docid: 2, title: "Pulp Therapy", collection: "aapd" }],
          },
        ],
        score_card: "## Score Card\n- Diagnosis: 3/4",
        status: "complete",
      },
      oralBoards,
    );

    expect(view?.title).toBe("Exam canvas");
    expect(view?.content).toContain("## Case");
    expect(view?.content).toContain("Sources");
    expect(view?.content).toContain("What is your diagnosis?");
    expect(view?.content).toContain("Score Card");
  });
});
