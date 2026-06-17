// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agents/ui", () => ({
  Button: (props: ComponentProps<"button">) => <button type="button" {...props} />,
}));

vi.mock("@agents/ui/components/ai-elements/tool", () => ({
  Tool: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ToolHeader: () => null,
  ToolContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const speakQuestion = vi.fn().mockResolvedValue(undefined);
const stopSpeaking = vi.fn();

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speakQuestion: (...args: unknown[]) => speakQuestion(...args),
  stopSpeaking: () => stopSpeaking(),
}));

vi.mock("./tool-adapter", () => ({
  toToolState: (s: string) => s,
}));

import { SpeakQuestionToolCall } from "./speak-question-tool-call";

describe("SpeakQuestionToolCall", () => {
  it("shows 'Preparing audio...' when question is undefined", () => {
    render(<SpeakQuestionToolCall status="inProgress" parameters={undefined} result={undefined} />);
    expect(screen.getByText("Preparing audio...")).toBeInTheDocument();
  });

  it("shows the question text when provided", () => {
    render(
      <SpeakQuestionToolCall
        status="inProgress"
        parameters={{ question: "What is your diagnosis?" }}
        result={undefined}
      />,
    );
    expect(screen.getByText("What is your diagnosis?")).toBeInTheDocument();
  });

  it("shows 'Examiner question' label", () => {
    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "Test question" }}
        result={undefined}
      />,
    );
    expect(screen.getByText("Examiner question")).toBeInTheDocument();
  });

  it("does not show Play button when status is not complete", () => {
    render(
      <SpeakQuestionToolCall
        status="inProgress"
        parameters={{ question: "Test question" }}
        result={undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /play/i })).not.toBeInTheDocument();
  });

  it("shows Play button when status is complete", () => {
    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "Test question" }}
        result={undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("calls speakQuestion when Play is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "What is your diagnosis?" }}
        result={undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(speakQuestion).toHaveBeenCalledWith("What is your diagnosis?");
  });

  it("shows Stop button while playing", async () => {
    const user = userEvent.setup();
    speakQuestion.mockImplementation(() => new Promise(() => {}));

    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "Test question" }}
        result={undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("calls stopSpeaking when Stop is clicked", async () => {
    const user = userEvent.setup();
    speakQuestion.mockImplementation(() => new Promise(() => {}));

    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "Test question" }}
        result={undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /play/i }));
    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(stopSpeaking).toHaveBeenCalled();
  });

  it("shows result text when result is a string", () => {
    render(
      <SpeakQuestionToolCall
        status="complete"
        parameters={{ question: "Test" }}
        result="Audio completed"
      />,
    );
    expect(screen.getByText("Audio completed")).toBeInTheDocument();
  });

  it("does not show result when result is not a string", () => {
    render(
      <SpeakQuestionToolCall status="complete" parameters={{ question: "Test" }} result={123} />,
    );
    expect(screen.queryByText("123")).not.toBeInTheDocument();
  });
});
