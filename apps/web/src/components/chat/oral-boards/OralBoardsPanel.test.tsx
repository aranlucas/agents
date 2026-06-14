import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OralBoardsState } from "@agents/types";

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speak: vi.fn().mockResolvedValue(""),
  stopSpeaking: vi.fn(),
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: string }) => (
    <span data-testid="streamdown">{children}</span>
  ),
}));

import { OralBoardsPanel } from "./OralBoardsPanel";

const noop = () => {};

describe("OralBoardsPanel", () => {
  it("renders the case vignette and question view when status is questioning", () => {
    const state: OralBoardsState = {
      case: "A 4-year-old presents with early childhood caries.",
      case_sources: [{ docid: 1, title: "AAPD Guideline", collection: "aapd" }],
      status: "questioning",
      transcript: [
        { question: "What is your treatment plan?", answer: "", feedback: "", citations: [] },
      ],
    };

    render(
      <OralBoardsPanel state={state} fullscreen={false} onClose={noop} onToggleFullscreen={noop} />,
    );

    expect(screen.getByText("A 4-year-old presents with early childhood caries.")).toBeDefined();
    expect(screen.getByText("Present case")).toBeDefined();
    // Transcript fallback question appears in QuestionView
    expect(screen.getByText("What is your treatment plan?")).toBeDefined();
  });

  it("renders the feedback view with score card and transcript when status is complete", () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nOverall: 85/100",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          feedback: "Good answer, consider also mentioning nitrous oxide.",
          citations: [],
        },
      ],
    };

    render(
      <OralBoardsPanel state={state} fullscreen={false} onClose={noop} onToggleFullscreen={noop} />,
    );

    expect(screen.getByText("Q1. Describe your approach to pain management.")).toBeDefined();
    expect(screen.getByText("Good answer, consider also mentioning nitrous oxide.")).toBeDefined();
  });
});
