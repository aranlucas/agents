import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResumeArtifact } from "./resume";

const view = {
  title: "Role fit brief",
  kind: "document" as const,
  content: "Strong fit from the selected resume evidence.",
  status: "ready",
  version: 1,
};

describe("ResumeArtifact", () => {
  it("renders a complete role-fit brief from typed agent state", () => {
    render(
      <ResumeArtifact
        state={{
          target_role: "Staff AI Platform Engineer",
          job_description: "Build and operate reliable multi-agent infrastructure.",
          fit_summary: "Lucas has strong **applied AI platform** experience.",
          gaps: ["No direct model-training infrastructure ownership is listed."],
          tailored_bullets: [
            "Built Ask DoorDash and its agent platform.",
            "Shipped MCP integrations across internal systems.",
          ],
          status: "ready",
          review_summary: "All claims are grounded in the source resume.",
        }}
        view={view}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Staff AI Platform Engineer" })).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByText("applied AI platform", { exact: false })).toBeVisible();
    expect(
      screen.getByText("No direct model-training infrastructure ownership is listed."),
    ).toBeVisible();
    expect(screen.getByText("Built Ask DoorDash and its agent platform.")).toBeVisible();
    expect(screen.getByText("All claims are grounded in the source resume.")).toBeVisible();
  });

  it("falls back gracefully for partial streamed state and closes from the header", () => {
    const onClose = vi.fn();
    render(
      <ResumeArtifact
        state={{ target_role: "Senior Go Engineer", status: "analyzing" }}
        view={{ ...view, content: "Assessment is still being drafted.", status: "analyzing" }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Analyzing")).toBeVisible();
    expect(screen.getByText("Assessment is still being drafted.")).toBeVisible();
    expect(screen.getByText("Gap analysis is in progress.")).toBeVisible();
    expect(
      screen.getByText("Tailored evidence will appear when the role analysis is complete."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close role fit brief" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
