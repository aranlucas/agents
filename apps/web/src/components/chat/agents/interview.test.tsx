import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InterviewArtifact } from "./interview";

const view = {
  title: "Practice board",
  kind: "document" as const,
  content: "Interview practice",
  status: "ready",
  version: 1,
};

describe("InterviewArtifact", () => {
  it("renders an unconfigured session without inventing a track", () => {
    render(<InterviewArtifact state={{}} view={view} onClose={vi.fn()} />);

    expect(screen.getByText("Interview practice")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Choose a practice track" })).toBeVisible();
    expect(screen.queryByText("Behavioral practice")).not.toBeInTheDocument();
    expect(screen.queryByText("Interview style")).not.toBeInTheDocument();
  });

  it("renders a coding question and progressive hint", () => {
    render(
      <InterviewArtifact
        state={{
          track: "coding",
          target_role: "Senior Software Engineer",
          target_level: "senior",
          difficulty: "medium",
          coaching_style: "interview",
          target_question_count: 3,
          completed_count: 1,
          status: "practicing",
          current_question: {
            id: "coding-service-order",
            track: "coding",
            title: "Safe service rollout order",
            prompt: "Return one valid rollout order or an empty list.",
            topic: "graphs",
            competency: "",
            difficulty: "medium",
            examples: ['["db", "api"] → ["db", "api"]'],
            constraints: ["The graph may contain a cycle"],
          },
          active_hint: "Track each service's in-degree.",
          hint_level: 1,
        }}
        view={view}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Senior Software Engineer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Safe service rollout order" })).toBeVisible();
    expect(screen.getByText("graphs")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hint 1" })).toBeVisible();
    expect(screen.getByText("1/3 questions")).toBeVisible();
  });

  it("renders evidence-based feedback and a completed summary", () => {
    render(
      <InterviewArtifact
        state={{
          track: "behavioral",
          target_role: "Staff Software Engineer",
          target_level: "staff",
          coaching_style: "guided",
          target_question_count: 2,
          completed_count: 2,
          average_score: 4.25,
          status: "complete",
          session_summary: "You showed **clear ownership** and reflection.",
          next_steps: ["Quantify the impact sooner"],
          history: [
            { question_id: "one", question_title: "Conflict", overall_score: 4.0 },
            { question_id: "two", question_title: "Influence", overall_score: 4.5 },
          ],
        }}
        view={view}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Session complete")).toBeVisible();
    expect(screen.getByText("4.3/5 average")).toBeVisible();
    expect(screen.getByText("clear ownership", { exact: false })).toBeVisible();
    expect(screen.getByText("Quantify the impact sooner")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Question history" })).toBeVisible();
  });

  it("renders feedback details and closes from the header", () => {
    const onClose = vi.fn();
    render(
      <InterviewArtifact
        state={{
          track: "behavioral",
          target_role: "Software Engineer",
          status: "feedback",
          active_feedback: {
            question_id: "behavioral-disagreement",
            question_title: "Disagreeing on a technical direction",
            attempt_summary: "The user described a rollout disagreement.",
            overall_score: 4,
            feedback: "The answer made the decision process clear.",
            rubric: [
              { dimension: "structure", score: 4, evidence: "Clear sequence." },
              { dimension: "specificity", score: 3, evidence: "More context would help." },
            ],
            strengths: ["Clear personal actions"],
            improvements: ["Quantify the result"],
            follow_up: "What did you learn?",
          },
        }}
        view={view}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("heading", { name: "Feedback" })).toBeVisible();
    expect(screen.getByText("Clear personal actions")).toBeVisible();
    expect(screen.getByText("Quantify the result")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close practice board" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
