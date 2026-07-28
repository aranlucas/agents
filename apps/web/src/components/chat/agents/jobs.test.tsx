import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JobsArtifact } from "./jobs";

const view = {
  title: "Job brief",
  kind: "document" as const,
  content: "Proposed resume",
  status: "ready",
  version: 1,
};

describe("JobsArtifact", () => {
  it("renders a saved watchlist and ranked job inbox", () => {
    render(
      <JobsArtifact
        state={{
          watchlist: {
            roles: ["Staff AI Product Engineer"],
            locations: ["San Francisco"],
            remote_only: true,
            company_preferences: [],
            must_have: ["Application-layer AI"],
            exclude: ["Defense"],
            minimum_salary_usd: 200000,
            max_results: 10,
          },
          inbox: [
            {
              id: "example-staff-ai",
              title: "Staff AI Product Engineer",
              company: "Example",
              location: "Remote — US",
              url: "https://example.com/jobs/staff-ai",
              posted_at: "2026-07-25",
              compensation: "$220,000–$260,000",
              summary: "Own agent products from prototype through launch.",
              match_score: 91,
              why_match: ["Strong product and agent delivery evidence."],
              concerns: ["Scope of model-training ownership is unclear."],
              sources: [
                {
                  title: "Example careers",
                  url: "https://example.com/jobs/staff-ai",
                  summary: "Original posting.",
                },
              ],
              match_verdict: "strong_match",
              status: "shortlisted",
            },
          ],
          inbox_refreshed_at: "2026-07-26T18:00:00Z",
          workspace_summary: "1 ranked job",
          status: "ready",
        }}
        view={view}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Job watchlist" })).toBeVisible();
    expect(screen.getByText("Remote only")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Ranked openings" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Staff AI Product Engineer" })).toBeVisible();
    expect(screen.getByText("91/100")).toBeVisible();
    expect(screen.getByText("Shortlisted")).toBeVisible();
    expect(screen.getByText("Scope of model-training ownership is unclear.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Example careers" })).toBeVisible();
  });

  it("renders research, fit, a proposed resume, and optional answers", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <JobsArtifact
          state={{
            target_title: "Staff AI Product Engineer",
            company: "Example",
            job_url: "https://example.com/jobs/staff-ai",
            research_summary: "Example is investing in **application-layer AI**.",
            sources: [
              {
                title: "Example engineering",
                url: "https://example.com/engineering",
                summary: "Primary source on the product area.",
              },
            ],
            match_score: 88,
            match_verdict: "strong_match",
            match_summary: "Strong evidence across product leadership and agent delivery.",
            strengths: ["Led Ask DoorDash from pitch to launch."],
            gaps: ["No model-training ownership documented."],
            tailored_resume: "# Lucas Arango\n\n- Led Ask DoorDash.",
            answers: [
              {
                field: "Why this role?",
                answer: "I like taking useful AI prototypes through launch.",
                evidence: "Ask DoorDash delivery.",
                sensitive: false,
              },
            ],
            status: "ready",
            review_summary: "Verify and edit before applying.",
          }}
          view={view}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { name: "Staff AI Product Engineer" })).toBeVisible();
      expect(screen.getByText("application-layer AI", { exact: false })).toBeVisible();
      expect(screen.getByText("88/100 match")).toBeVisible();
      expect(screen.getByText("Led Ask DoorDash from pitch to launch.")).toBeVisible();
      expect(screen.getByRole("heading", { name: "Proposed tailored resume" })).toBeVisible();
      expect(screen.getByText("I like taking useful AI prototypes through launch.")).toBeVisible();
      expect(screen.getByRole("link", { name: "Original posting" })).toHaveAttribute(
        "href",
        "https://example.com/jobs/staff-ai",
      );
      expect(consoleError.mock.calls.flat().join("\n")).not.toContain("expected a native <button>");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("closes from the artifact header", () => {
    const onClose = vi.fn();
    render(<JobsArtifact state={{ status: "researching" }} view={view} onClose={onClose} />);

    expect(screen.getByText("Researching")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close job brief" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
