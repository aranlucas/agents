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

vi.mock("@agents/ui/hooks/use-mobile", () => ({
  useIsMobile: vi.fn().mockReturnValue(false),
}));

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

  it("keeps the exam surface mounted when questioning transitions to feedback", async () => {
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

    const questioningState: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };
    const onAnswer = vi.fn();
    const { rerender } = render(
      <OralBoardsPanel state={questioningState} {...baseProps} onAnswer={onAnswer} />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "My diagnosis is reversible pulpitis.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    rerender(
      <OralBoardsPanel
        state={{ ...questioningState, status: "feedback" }}
        {...baseProps}
        isRunning={true}
        loadingStep="Reviewing your answer…"
        onAnswer={onAnswer}
      />,
    );

    const timeline = screen.getByRole("list", { name: "Exam progress" });

    expect(screen.getByText("What is your diagnosis?")).toBeInTheDocument();
    expect(screen.getByText("My diagnosis is reversible pulpitis.")).toBeInTheDocument();
    expect(within(timeline).getByText("Reviewing")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("status")).toHaveTextContent("Reviewing your answer…");
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
    expect(screen.queryByText("No feedback yet.")).not.toBeInTheDocument();

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

  it("does not render a fake next question while computing the score card", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your final recommendation?",
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

  it("collapses model answer and citations in live feedback by default", async () => {
    const citation = {
      docid: 17,
      title: "Local Anesthesia Guideline",
      collection: "aapd" as const,
    };
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "Which anesthetic would you choose?",
          answer: "I would use local anesthesia.",
          feedback: "Consider anesthetic selection.",
          ideal_response: "Use articaine with epinephrine.",
          citations: [citation],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Consider anesthetic selection.")).toBeInTheDocument();
    expect(screen.queryByText("Use articaine with epinephrine.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Local Anesthesia Guideline/)).not.toBeInTheDocument();

    const detailsTrigger = screen.getByRole("button", {
      name: "Show model answer and sources",
    });
    const chevron = detailsTrigger.querySelector("svg");

    expect(chevron).toHaveClass("group-data-panel-open:rotate-180");

    await userEvent.click(detailsTrigger);

    expect(detailsTrigger).toHaveAttribute("data-panel-open", "");
    expect(screen.getByText("Use articaine with epinephrine.")).toBeInTheDocument();
    expect(screen.getByText(/Local Anesthesia Guideline/)).toBeInTheDocument();
  });
});

describe("OralBoardsPanel — mobile questioning", () => {
  const setMobile = async (value: boolean) => {
    const { useIsMobile } = await import("@agents/ui/hooks/use-mobile");
    vi.mocked(useIsMobile).mockReturnValue(value);
  };

  const state: OralBoardsState = {
    case: "A 4-year-old presents with early childhood caries.",
    case_sources: [],
    status: "questioning",
    transcript: [],
  };

  it("stacks the workspace into Case/Exam tabs with the exam active by default", async () => {
    await setMobile(true);

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByRole("tab", { name: "Case" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exam" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Case notes")).not.toBeInTheDocument();

    await setMobile(false);
  });

  it("shows the vignette and notes on the Case tab", async () => {
    await setMobile(true);

    render(<OralBoardsPanel state={state} {...baseProps} />);
    await userEvent.click(screen.getByRole("tab", { name: "Case" }));

    expect(
      screen.getByText("A 4-year-old presents with early childhood caries."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Case notes")).toBeInTheDocument();

    await setMobile(false);
  });
});

describe("OralBoardsPanel — complete", () => {
  it("renders only the final feedback pane once a score card is present", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "feedback",
      score_card: "## Score\nStrong management reasoning overall.",
      transcript: [],
    };

    render(
      <OralBoardsPanel
        state={state}
        {...baseProps}
        isRunning={true}
        loadingStep="Computing score card…"
      />,
    );

    expect(screen.getByText("Strong management reasoning overall.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Exam progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the outcome banner, per-skillset score table, and collapsible transcript review", async () => {
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

    expect(screen.getByText(/Practice outcome:/)).toBeInTheDocument();
    expect(screen.getByText(/Borderline/)).toBeInTheDocument();

    expect(screen.getAllByText("Analyze / Evaluate").length).toBeGreaterThan(0);
    expect(screen.getByText("Solid plan; thin on alternatives.")).toBeInTheDocument();

    const reviewHeading = screen.getByRole("heading", { name: "Question review" });
    expect(reviewHeading).toBeInTheDocument();
    expect(screen.getByLabelText("Question review")).toHaveAttribute(
      "aria-labelledby",
      reviewHeading.id,
    );

    const review = screen.getByRole("button", { name: /^Q1/ });
    expect(review).toBeInTheDocument();
    expect(
      screen.queryByText("Your answer: I would use local anesthesia."),
    ).not.toBeInTheDocument();

    await userEvent.click(review);

    expect(
      screen.getAllByText("Describe your approach to pain management.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === "P" &&
          el.textContent?.includes("Your answer: I would use local anesthesia."),
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show model answer and sources" }));

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

  it("collapses completed question reviews on the final score screen", async () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nStrong management reasoning overall.",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          feedback: "Good.",
          ideal_response: "Use articaine with epinephrine.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByRole("button", { name: /^Q1/ })).toBeInTheDocument();
    expect(
      screen.queryByText("Your answer: I would use local anesthesia."),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Q1/ }));

    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === "P" &&
          el.textContent?.includes("Your answer: I would use local anesthesia."),
      ),
    ).toBeInTheDocument();
  });

  it("shows exchange metadata in the trigger while the review stays collapsed", () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nStrong management reasoning overall.",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          skillset: "Behavior Guidance",
          skill: "analyze_evaluate",
          score: 2,
          feedback: "Good.",
          ideal_response: "Use articaine with epinephrine.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const review = screen.getByRole("button", { name: /^Q1/ });

    expect(within(review).getByText("Behavior Guidance")).toBeInTheDocument();
    expect(within(review).getByText("Analyze / Evaluate")).toBeInTheDocument();
    expect(within(review).getByText("2/3")).toBeInTheDocument();
    expect(
      screen.queryByText("Your answer: I would use local anesthesia."),
    ).not.toBeInTheDocument();
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
