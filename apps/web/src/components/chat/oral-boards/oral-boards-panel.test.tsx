// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CaseSource,
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsSkill,
  OralBoardsState,
} from "@agents/types";

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
      case_sources: [
        { docid: 1, filepath: "aapd/guideline.md", title: "AAPD Guideline", collection: "aapd" },
      ],
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
        state={{ ...state, loading_step: "Reviewing your answer…" }}
        {...baseProps}
        isRunning={true}
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
        state={{
          ...questioningState,
          status: "feedback",
          loading_step: "Reviewing your answer…",
        }}
        {...baseProps}
        isRunning={true}
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
        state={{ ...state, loading_step: "Computing score card…" }}
        {...baseProps}
        isRunning={true}
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

  it("hides the target badges and hint when target fields are missing", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: "What is your working diagnosis?",
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

    expect(screen.getByText("What is your working diagnosis?")).toBeInTheDocument();
    expect(screen.queryByText("Pulp Therapy")).not.toBeInTheDocument();
    expect(screen.queryByText(/reach and defend a decision/)).not.toBeInTheDocument();

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

  it("renders the collapsed 'How to answer like a 3' answer-coach trigger", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "How to answer like a 3" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("data-panel-open");
  });

  it("collapses model answer and citations in live feedback by default", async () => {
    const citation = {
      docid: 17,
      filepath: "aapd/local-anesthesia.md",
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
        state={{ ...state, loading_step: "Computing score card…" }}
        {...baseProps}
        isRunning={true}
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

  it("shows an empty-state message when there is no score card, summary, or transcript", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "complete",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("No feedback yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start a new case/ })).not.toBeInTheDocument();
  });
});

describe("OralBoardsPanel — malformed agent state", () => {
  // State is written by LLMs at runtime; the panel must degrade, not crash —
  // an uncaught render error blanks the whole page (no error boundary above).
  it("renders citation chips with fallback text when fields are missing", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [
        {} as unknown as CaseSource,
        { docid: 4 } as unknown as CaseSource,
        { collection: 7 } as unknown as CaseSource,
      ],
      status: "presenting",
      transcript: [],
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
    expect(screen.getAllByText(/Untitled/).length).toBeGreaterThan(0);
  });

  it("computes a correct per-skillset average when scores arrive as strings", () => {
    // Naive `reduce((a, b) => a + b, 0)` string-concatenates "2" and "3" into
    // "023" before dividing — 11.5, not 2.5. Two exchanges catch that; a
    // single-score case can accidentally look right because "/" coerces its
    // operands to numbers.
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "Q1",
          answer: "A1",
          feedback: "F1",
          ideal_response: "I1",
          citations: [],
          skillset: "Behavior Guidance",
          score: "2" as unknown as 1 | 2 | 3,
        },
        {
          question: "Q2",
          answer: "A2",
          feedback: "F2",
          ideal_response: "I2",
          citations: [],
          skillset: "Behavior Guidance",
          score: "3" as unknown as 1 | 2 | 3,
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);
    expect(screen.getByText("2.5")).toBeInTheDocument();
  });

  it("colors a string score badge correctly instead of defaulting to red", () => {
    // scoreClasses does `score === 2`, which is strictly false for the string
    // "2" — a score of "2" was falling through to the red (failing) branch.
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "Q1",
          answer: "A1",
          feedback: "F1",
          ideal_response: "I1",
          citations: [],
          score: "2" as unknown as 1 | 2 | 3,
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);
    const badge = screen.getByText("2/3");
    expect(badge).toHaveClass("text-amber-300");
  });

  it("colors a string score correctly in the final score summary table", () => {
    const state: OralBoardsState = {
      case: "Case.",
      status: "complete",
      transcript: [],
      score_card: "Done.",
      score_summary: [
        {
          skillset: "Pulp Therapy",
          score: "2" as unknown as 1 | 2 | 3,
          rationale: "Solid.",
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);
    const badge = screen.getByText("2/3");
    expect(badge).toHaveClass("text-amber-300");
  });

  it("falls back to a placeholder skillset label instead of crashing on a non-string skillset", () => {
    const state: OralBoardsState = {
      case: "Case.",
      status: "complete",
      transcript: [],
      score_card: "Done.",
      score_summary: [
        {
          skillset: { nope: true } as unknown as string,
          score: 2,
          rationale: { nope: true } as unknown as string,
        },
      ],
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
    expect(screen.getByText("Unknown skillset")).toBeInTheDocument();
  });

  it("survives a non-array transcript, case_sources, and score_summary", () => {
    const state = {
      case: "Case.",
      status: "complete",
      transcript: "not-an-array",
      case_sources: { nope: true },
      score_summary: "also-not-an-array",
      score_card: "Done.",
    } as unknown as OralBoardsState;

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
  });

  it("survives a non-string ideal_response inside feedback details", async () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "Q1",
          answer: "A1",
          feedback: "F1",
          ideal_response: 42 as unknown as string,
          citations: [],
        },
      ],
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
  });

  it("survives a non-array citations list on a transcript exchange", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "Q1",
          answer: "A1",
          feedback: "F1",
          ideal_response: "I1",
          citations: "not-an-array" as unknown as CaseSource[],
        },
      ],
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
  });

  it("ignores a non-string active_probe instead of crashing on .trim()", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
      active_probe: 42 as unknown as string,
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
    expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
  });

  it("renders the score table when a skill label is off-enum", () => {
    const state: OralBoardsState = {
      case: "Case.",
      status: "complete",
      transcript: [],
      score_card: "Overall solid.",
      score_summary: [
        {
          skillset: "Pulp Therapy",
          skill: "Remember" as OralBoardsSkill,
          score: 2,
          rationale: "",
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Pulp Therapy")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("survives transcript exchanges with missing fields", () => {
    const partial = {
      question: undefined,
      answer: undefined,
      feedback: undefined,
      ideal_response: undefined,
      citations: undefined,
    } as unknown as OralBoardsExchange;
    const state: OralBoardsState = {
      case: "Case.",
      status: "questioning",
      transcript: [partial, partial],
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
  });

  it("ignores an unknown outcome value instead of crashing", () => {
    const state: OralBoardsState = {
      case: "Case.",
      status: "complete",
      transcript: [],
      score_card: "Done.",
      outcome: "unknown_outcome" as OralBoardsOutcome,
    };

    expect(() => render(<OralBoardsPanel state={state} {...baseProps} />)).not.toThrow();
  });
});

describe("OralBoardsPanel — examiner probe", () => {
  it("keeps the original question and renders a mirrored probe only once", async () => {
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    const probe = "Which finding would exclude pulpotomy?";
    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      currentQuestion: probe,
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
      current_question: "How would you manage the pulp exposure?",
      active_probe: probe,
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("How would you manage the pulp exposure?")).toBeInTheDocument();
    expect(screen.getAllByText(probe)).toHaveLength(1);
  });

  it("shows the follow-up probe as the active question when active_probe is set", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
      active_probe: "How long would you splint the tooth?",
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("How long would you splint the tooth?")).toBeInTheDocument();
    expect(screen.getByText(/follow-up/i)).toBeInTheDocument();
  });

  it("re-enables the composer when a probe arrives while still reviewing the prior answer", async () => {
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
      "Reversible pulpitis.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    rerender(
      <OralBoardsPanel
        state={{ ...state, loading_step: "Reviewing your answer…" }}
        {...baseProps}
        isRunning={true}
        onAnswer={vi.fn()}
      />,
    );

    // Still reviewing: the composer is replaced by the submitted-answer view.
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
    expect(screen.getByText("Reversible pulpitis.")).toBeInTheDocument();

    // A follow-up probe arrives mid-review — it supersedes the prior question,
    // so the composer must come back even though isRunning is still true.
    rerender(
      <OralBoardsPanel
        state={{
          ...state,
          active_probe: "How long would you splint the tooth?",
          loading_step: "Reviewing your answer…",
        }}
        {...baseProps}
        isRunning={true}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();

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
});

describe("OralBoardsPanel — auto-scroll", () => {
  afterEach(async () => {
    const { useIsMobile } = await import("@agents/ui/hooks/use-mobile");
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
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

  it("scrolls the newest exam content into view on mobile when the question changes", async () => {
    const { useIsMobile } = await import("@agents/ui/hooks/use-mobile");
    vi.mocked(useIsMobile).mockReturnValue(true);
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    const { useOralBoardsQuestion } = await import("@/lib/copilotkit/oral-boards-question-context");
    const questionContext = {
      currentQuestion: "What is your initial impression?",
      setCurrentQuestion: vi.fn(),
      clearCurrentQuestion: vi.fn(),
      pendingInputKind: "answer" as const,
      registerPendingInput: vi.fn(),
      clearPendingInput: vi.fn(),
      respondToPendingInput: vi.fn(),
    };
    vi.mocked(useOralBoardsQuestion).mockReturnValue(questionContext);

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };
    const { rerender } = render(<OralBoardsPanel state={state} {...baseProps} />);
    scrollSpy.mockClear();

    vi.mocked(useOralBoardsQuestion).mockReturnValue({
      ...questionContext,
      currentQuestion: "What radiographs would you take?",
    });
    rerender(<OralBoardsPanel state={state} {...baseProps} />);

    expect(scrollSpy).toHaveBeenCalled();
  });

  it("does not scroll on initial mount", async () => {
    const { useIsMobile } = await import("@agents/ui/hooks/use-mobile");
    vi.mocked(useIsMobile).mockReturnValue(true);
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

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

    expect(scrollSpy).not.toHaveBeenCalled();
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
