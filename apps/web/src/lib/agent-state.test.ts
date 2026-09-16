import { describe, expect, it } from "vitest";

import { oneOf, toOralBoardsState, toResumeState, toTrendsState } from "./agent-state";

describe("oneOf", () => {
  const colors = ["red", "green", "blue"] as const;

  it("returns the value when allowed", () => {
    expect(oneOf("green", colors, "red")).toBe("green");
  });

  it("returns the fallback for disallowed or non-string values", () => {
    expect(oneOf("purple", colors, "red")).toBe("red");
    expect(oneOf(undefined, colors, "blue")).toBe("blue");
    expect(oneOf(123, colors, "blue")).toBe("blue");
  });
});

describe("toResumeState", () => {
  it("coerces the role-fit contract defensively", () => {
    expect(
      toResumeState({
        target_role: "Staff AI Platform Engineer",
        job_description: "Build reliable agent infrastructure.",
        fit_summary: "Strong platform and applied AI match.",
        gaps: ["No direct model-training ownership", 42],
        tailored_bullets: ["Built Ask DoorDash", null, "Led MCP integrations"],
        status: "ready",
        review_summary: "Grounded in the source resume.",
      }),
    ).toEqual({
      target_role: "Staff AI Platform Engineer",
      job_description: "Build reliable agent infrastructure.",
      fit_summary: "Strong platform and applied AI match.",
      gaps: ["No direct model-training ownership"],
      tailored_bullets: ["Built Ask DoorDash", "Led MCP integrations"],
      status: "ready",
      review_summary: "Grounded in the source resume.",
    });
  });

  it("returns the backend initial state for invalid input", () => {
    expect(toResumeState(undefined)).toEqual({
      target_role: "",
      job_description: "",
      fit_summary: "",
      gaps: [],
      tailored_bullets: [],
      status: "idle",
      review_summary: "",
    });
  });
});

describe("toTrendsState", () => {
  it("keeps only renderable result cells and defaults invalid state", () => {
    expect(
      toTrendsState({
        query: "top searches",
        generated_sql: "SELECT 1 LIMIT 10",
        columns: ["term", "dma_count", 42],
        rows: [{ term: "solar eclipse", dma_count: 178, ignored: { nested: true } }, "invalid"],
        insights: "Solar eclipse has the widest reach.",
        status: "ready",
      }),
    ).toEqual({
      query: "top searches",
      generated_sql: "SELECT 1 LIMIT 10",
      columns: ["term", "dma_count"],
      rows: [{ term: "solar eclipse", dma_count: 178 }, {}],
      insights: "Solar eclipse has the widest reach.",
      status: "ready",
      error: "",
    });

    expect(toTrendsState(undefined)).toEqual({
      query: "",
      generated_sql: "",
      columns: [],
      rows: [],
      insights: "",
      status: "idle",
      error: "",
    });
  });
});

describe("toOralBoardsState", () => {
  it("retains the client-visible oralboards state contract", () => {
    expect(
      toOralBoardsState({
        interview_complete: false,
        active_ideal_response: "I would first evaluate the patient's current findings.",
      }),
    ).toMatchObject({
      interview_complete: false,
      active_ideal_response: "I would first evaluate the patient's current findings.",
    });
  });

  it("defaults missing and wrongly-typed top-level fields", () => {
    expect(
      toOralBoardsState({
        case: 42,
        transcript: "not-an-array",
        score_summary: "also-not-an-array",
        score_card: ["nope"],
        status: "bogus",
        active_probe: 42,
        current_question: { text: "Q" },
      }),
    ).toEqual({
      case: "",
      transcript: [],
      score_card: "",
      score_summary: [],
      outcome: undefined,
      status: "idle",
      loading_step: "",
      current_question: "",
      interview_complete: false,
      active_feedback: "",
      active_ideal_response: "",
      active_probe: "",
    });
  });

  it("coerces transcript exchanges and drops invalid scores", () => {
    expect(
      toOralBoardsState({
        transcript: [
          {
            question: "Q1",
            answer: "A1",
            feedback: "F1",
            ideal_response: 42,
            skillset: "Pulp Therapy",
            skill: "remember",
            score: 2,
          },
        ],
      }).transcript,
    ).toEqual([
      {
        question: "Q1",
        answer: "A1",
        feedback: "F1",
        ideal_response: "",
        skillset: "Pulp Therapy",
        skill: "remember",
        score: 2,
      },
    ]);
  });
});

describe("agent-state (no A2UI showcase)", () => {
  it("no longer exposes toA2UIState", async () => {
    // toA2UIState was removed with the standalone showcase; the module must no
    // longer export it. Import dynamically so the absence is a runtime fact,
    // not a compile error.
    const mod = (await import("./agent-state")) as Record<string, unknown>;
    expect(mod.toA2UIState).toBeUndefined();
  });
});
