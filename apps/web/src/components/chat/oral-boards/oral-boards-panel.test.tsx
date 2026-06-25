// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from "react";
import { render, screen, within } from "@testing-library/react";
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
    pendingInputKind: null,
    registerPendingInput: vi.fn(),
    clearPendingInput: vi.fn(),
    respondToPendingInput: vi.fn(),
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

vi.mock("@agents/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agents/ui")>();
  return {
    ...actual,
    ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ResizablePanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ResizableHandle: () => null,
  };
});

import { OralBoardsPanel } from "./oral-boards-panel";

const noop = () => {};

const baseProps = {
  onClose: noop,
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

    expect(
      screen.getByText("A 4-year-old presents with early childhood caries."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Begin Examination" })).toBeInTheDocument();
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
  it("fills the available workspace height", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const panel = screen.getByText("Oral board").parentElement?.parentElement;
    expect(panel).toHaveClass("h-full");
  });

  it("renders the active question from useOralBoardsQuestion (live)", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your initial impression?",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: "answer",
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    });

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("What is your initial impression?")).toBeInTheDocument();

    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: null,
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
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
          ideal_response: "X-rays are needed.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Your answer: I see caries.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Q1 ·/ })).not.toBeInTheDocument();
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
          ideal_response: "Assess radiographs.",
          citations: [],
        },
        {
          question: "What data do you need?",
          answer: "Radiographs.",
          feedback: "Correct.",
          ideal_response: "Bitewings and PA.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const chip = screen.getByRole("button", { name: /^Q1/ });
    expect(chip).toBeInTheDocument();
    expect(screen.queryByText("Your answer: I see caries.")).not.toBeInTheDocument();
    expect(screen.getByText("Your answer: Radiographs.")).toBeInTheDocument();

    await userEvent.click(chip);
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === "P" && el.textContent?.includes("Your answer: I see caries."),
      ),
    ).toBeInTheDocument();

    await userEvent.click(chip);
    expect(
      screen.queryByText(
        (_content, el) =>
          el?.tagName === "P" && el.textContent?.includes("Your answer: I see caries."),
      ),
    ).not.toBeInTheDocument();
  });

  it("labels the current questioning stage accessibly", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your diagnosis?",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: "answer",
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    });

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const timeline = screen.getByRole("list", { name: "Exam progress" });
    const stages = within(timeline).getAllByRole("listitem");

    expect(stages).toHaveLength(4);
    expect(within(timeline).getByText("Case")).toBeInTheDocument();
    expect(within(timeline).getByText("Question 1")).toHaveAttribute("aria-current", "step");
    expect(within(timeline).getByText("Reviewing")).toBeInTheDocument();
    expect(within(timeline).getByText("Complete")).toBeInTheDocument();

    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: null,
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    });
  });

  it("keeps the submitted question and answer visible while reviewing", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your diagnosis?",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: "answer",
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    });

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    const { rerender } = render(
      <OralBoardsPanel state={state} {...baseProps} onAnswer={vi.fn()} />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "My diagnosis is reversible pulpitis.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    rerender(
      <OralBoardsPanel
        state={state}
        {...baseProps}
        isRunning={true}
        loadingStep="Reviewing your answer…"
        onAnswer={vi.fn()}
      />,
    );

    const timeline = screen.getByRole("list", { name: "Exam progress" });

    expect(within(timeline).getAllByRole("listitem")).toHaveLength(4);
    expect(within(timeline).getByText("Case")).toBeInTheDocument();
    expect(within(timeline).getByText("Question 1")).toBeInTheDocument();
    expect(within(timeline).getByText("Reviewing")).toHaveAttribute("aria-current", "step");
    expect(within(timeline).getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("What is your diagnosis?")).toBeInTheDocument();
    expect(screen.getByText("My diagnosis is reversible pulpitis.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reviewing your answer…");
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();

    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: null,
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    });
  });

  it("does not render a fake next question while computing the score card", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: Array.from({ length: 6 }, (_value, index) => ({
        question: `Question ${index + 1}?`,
        answer: `Answer ${index + 1}`,
        feedback: `Feedback ${index + 1}`,
        ideal_response: `Ideal ${index + 1}`,
        citations: [],
      })),
    };

    render(
      <OralBoardsPanel
        state={state}
        {...baseProps}
        isRunning={true}
        loadingStep="Computing score card…"
      />,
    );

    const timeline = screen.getByRole("list", { name: "Exam progress" });

    expect(within(timeline).getAllByRole("listitem")).toHaveLength(4);
    expect(within(timeline).getByText("Case")).toBeInTheDocument();
    expect(within(timeline).getByText("Question 6")).toBeInTheDocument();
    expect(within(timeline).getByText("Reviewing")).toBeInTheDocument();
    expect(within(timeline).getByText("Complete")).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Computing score card…");
    expect(screen.queryByText("Question 7")).not.toBeInTheDocument();
  });
});

describe("OralBoardsPanel — complete", () => {
  it("renders the outcome banner, per-skillset score table, model answer, and transcript", () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nStrong management reasoning overall.",
      score_summary: [
        {
          skillset: "Behavior Guidance",
          skill: "analyze_evaluate",
          score: 2,
          rationale: "Solid plan; thin on alternatives.",
        },
      ],
      outcome: "borderline",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          skillset: "Behavior Guidance",
          skill: "analyze_evaluate",
          score: 2,
          feedback: "**Skillset:** Behavior Guidance · Analyze/Evaluate\nGood.",
          ideal_response: "Use articaine with epinephrine.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("Describe your approach to pain management.")).toBeInTheDocument();
    expect(screen.getByText("Your answer: I would use local anesthesia.")).toBeInTheDocument();

    expect(screen.getByText(/Practice outcome:/)).toBeInTheDocument();
    expect(screen.getByText(/Borderline/)).toBeInTheDocument();

    expect(screen.getAllByText("Analyze / Evaluate").length).toBeGreaterThan(0);
    expect(screen.getByText("Solid plan; thin on alternatives.")).toBeInTheDocument();

    expect(screen.getByText("Model answer")).toBeInTheDocument();
    expect(screen.getByText("Use articaine with epinephrine.")).toBeInTheDocument();
  });

  it("offers a Start a new case action and fires onClose", async () => {
    const onClose = vi.fn();
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nNice work.",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Start a new case/ }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("OralBoardsPanel — notes", () => {
  it("carries case notes from the presenting view into questioning", async () => {
    const presenting: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "presenting",
      transcript: [],
    };
    const { rerender } = render(<OralBoardsPanel state={presenting} {...baseProps} />);

    const notesField = screen.getByLabelText("Case notes");
    await userEvent.type(notesField, "ECC on #B and #I");
    expect(notesField).toHaveValue("ECC on #B and #I");

    rerender(<OralBoardsPanel state={{ ...presenting, status: "questioning" }} {...baseProps} />);

    expect(screen.getByLabelText("Case notes")).toHaveValue("ECC on #B and #I");
  });
});
