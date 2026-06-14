import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@/lib/copilotkit/oral-boards-question", () => ({
  useCurrentQuestion: vi.fn().mockReturnValue(""),
}));

import { OralBoardsPanel } from "./OralBoardsPanel";

const noop = () => {};

const baseProps = {
  fullscreen: false,
  onClose: noop,
  onToggleFullscreen: noop,
  onReady: noop,
};

describe("OralBoardsPanel — presenting", () => {
  it("renders the vignette and Ready to begin button", () => {
    const state: OralBoardsState = {
      case: "A 4-year-old presents with early childhood caries.",
      case_sources: [{ docid: 1, title: "AAPD Guideline", collection: "aapd" }],
      status: "presenting",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("A 4-year-old presents with early childhood caries.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ready to begin" })).toBeDefined();
  });

  it("calls onReady when Ready to begin is clicked", async () => {
    const onReady = vi.fn();
    const state: OralBoardsState = {
      case: "Case text.",
      case_sources: [],
      status: "presenting",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} onReady={onReady} />);
    await userEvent.click(screen.getByRole("button", { name: "Ready to begin" }));

    expect(onReady).toHaveBeenCalledOnce();
  });
});

describe("OralBoardsPanel — questioning", () => {
  it("renders collapsible vignette summary and current question fallback", () => {
    const state: OralBoardsState = {
      case: "A 4-year-old presents with early childhood caries.",
      case_sources: [],
      status: "questioning",
      transcript: [
        { question: "What is your initial impression?", answer: "", feedback: "", citations: [] },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Case vignette")).toBeDefined();
    // fallback to last transcript question when useCurrentQuestion returns ""
    expect(screen.getByText("What is your initial impression?")).toBeDefined();
  });

  it("renders prior exchange feedback in the transcript list", () => {
    const state: OralBoardsState = {
      case: "Case text.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What additional history do you need?",
          answer: "I would ask about diet.",
          feedback: "**Interview phase:** Data gathering and diagnosis\nGood start.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Your answer: I would ask about diet.")).toBeDefined();
  });
});

describe("OralBoardsPanel — complete", () => {
  it("renders score card and full transcript", () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nComposite: 2.4 / 3.0",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          feedback: "**Interview phase:** Management and treatment planning\nGood.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Q1. Describe your approach to pain management.")).toBeDefined();
    expect(screen.getByText("Your answer: I would use local anesthesia.")).toBeDefined();
  });
});
