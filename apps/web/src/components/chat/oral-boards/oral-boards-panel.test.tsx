// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from "react";
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

vi.mock("@/lib/copilotkit/oral-boards-question-context", () => ({
  useOralBoardsQuestion: vi.fn().mockReturnValue({
    currentQuestion: "",
    setCurrentQuestion: vi.fn(),
    clearCurrentQuestion: vi.fn(),
  }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAudioRecorder: forwardRef(function MockAudioRecorder(_, ref) {
    useImperativeHandle(ref, () => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(new Blob(["audio"])),
    }));
    return null;
  }),
}));

vi.mock("@/lib/copilotkit/use-answer-recorder", () => ({
  useAnswerRecorder: (_onTranscript: (t: string) => void) => ({
    recording: false,
    transcribing: false,
    micSupported: false,
    error: null,
    clearError: vi.fn(),
    toggle: vi.fn(),
    recorderRef: { current: null },
  }),
}));

import { OralBoardsPanel } from "./oral-boards-panel";

const noop = () => {};

const baseProps = {
  fullscreen: false,
  onClose: noop,
  onToggleFullscreen: noop,
  onReady: noop,
  onAnswer: noop,
  isRunning: false,
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
    expect(screen.getByRole("button", { name: "Begin Examination" })).toBeDefined();
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
    await userEvent.click(screen.getByRole("button", { name: "Begin Examination" }));

    expect(onReady).toHaveBeenCalledOnce();
  });
});

describe("OralBoardsPanel — questioning", () => {
  it("renders the active question from useOralBoardsQuestion (live)", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your initial impression?",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
    });

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("What is your initial impression?")).toBeDefined();

    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
    });
  });

  it("calls onAnswer with trimmed text and clears textarea on Submit", async () => {
    const onAnswer = vi.fn();
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} onAnswer={onAnswer} />);

    const textarea = screen.getByPlaceholderText(/Type your answer…/);
    await userEvent.type(textarea, "  My answer  ");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onAnswer).toHaveBeenCalledWith("My answer");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("disables Submit while isRunning", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} isRunning={true} />);

    const submitBtn = screen.getByRole("button", { name: "Submit" });
    expect(submitBtn).toHaveProperty("disabled", true);
  });

  it("shows the most recent exchange as an always-visible feedback block", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What is your initial impression?",
          answer: "I see caries.",
          feedback: "Good start.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Your answer: I see caries.")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Q1 ·/ })).toBeNull();
  });

  it("older exchanges collapse to chips; only the last stays expanded", async () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What is your initial impression?",
          answer: "I see caries.",
          feedback: "Good.",
          citations: [],
        },
        {
          question: "What data do you need?",
          answer: "Radiographs.",
          feedback: "Correct.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const chip = screen.getByRole("button", { name: /^Q1/ });
    expect(chip).toBeDefined();
    expect(screen.queryByText("Your answer: I see caries.")).toBeNull();
    expect(screen.getByText("Your answer: Radiographs.")).toBeDefined();

    await userEvent.click(chip);
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === "P" && el.textContent?.includes("Your answer: I see caries."),
      ),
    ).toBeDefined();

    await userEvent.click(chip);
    expect(
      screen.queryByText(
        (_content, el) =>
          el?.tagName === "P" && el.textContent?.includes("Your answer: I see caries."),
      ),
    ).toBeNull();
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

    expect(screen.getByText("Q1")).toBeDefined();
    expect(screen.getByText("Describe your approach to pain management.")).toBeDefined();
    expect(screen.getByText("Your answer: I would use local anesthesia.")).toBeDefined();
  });
});
