// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OralBoardsReport } from "./oral-boards-export";
import {
  buildOralBoardsMarkdown,
  createOralBoardsPdf,
  exportOralBoardsReport,
} from "./oral-boards-export";

const report: OralBoardsReport = {
  caseBody: "A 4-year-old presents with **early childhood caries**.",
  outcome: "borderline",
  scoreCard: "## Summary\nStrong reasoning with room to improve.",
  scoreSummary: [
    {
      skillset: "Behavior | Guidance",
      skill: "analyze_evaluate",
      score: 2,
      rationale: "Solid plan; thin on alternatives.",
    },
  ],
  transcript: [
    {
      question: "How would you manage this patient?",
      answer: "I would assess risk and stabilize disease.",
      skillset: "Behavior Guidance",
      skill: "analyze_evaluate",
      score: 2,
      feedback: "Good start - explain the alternatives.",
      ideal_response: "I would begin with a complete risk assessment.",
    },
  ],
};

const generatedAt = new Date(2026, 7, 9, 12);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("oral boards report exports", () => {
  it("builds a self-contained Markdown report", () => {
    const markdown = buildOralBoardsMarkdown(report, generatedAt);

    expect(markdown).toContain("# Oral Boards Practice Report");
    expect(markdown).toContain("Generated August 9, 2026");
    expect(markdown).toContain("## Case vignette");
    expect(markdown).toContain("Behavior \\| Guidance");
    expect(markdown).toContain("| Analyze / Evaluate | 2/3 |");
    expect(markdown).toContain("## Examiner summary");
    expect(markdown).toContain("### Question 1");
    expect(markdown).toContain("**Your answer**");
    expect(markdown).toContain("**Model answer**");
  });

  it("generates a non-empty PDF document", async () => {
    const pdf = await createOralBoardsPdf(report, generatedAt);

    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(1_000);
  });

  it("uses native file sharing when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    const result = await exportOralBoardsReport("markdown", report, generatedAt);

    expect(result).toBe("shared");
    expect(canShare).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Oral Boards Practice Report",
        files: [
          expect.objectContaining({
            name: "oral-boards-practice-2026-08-09.md",
            type: "text/markdown;charset=utf-8",
          }),
        ],
      }),
    );
  });

  it("downloads the file when native sharing is unavailable", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:oral-boards-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await exportOralBoardsReport("markdown", report, generatedAt);

    expect(result).toBe("downloaded");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
