// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  OralBoardsQuestionProvider,
  useOralBoardsQuestion,
} from "@/lib/copilotkit/oral-boards-question-context";

const stableAgent = {
  state: { current_question: "" },
  setState: vi.fn(),
};

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "OnStateChanged" },
  useAgent: () => ({ agent: stableAgent }),
  useDefaultRenderTool: vi.fn(),
  useFrontendTool: vi.fn(),
  useRenderTool: vi.fn(),
}));

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speakQuestion: vi.fn().mockResolvedValue(undefined),
}));

import { OralBoardsExtension } from "./oral-boards";

function CurrentQuestion() {
  const { currentQuestion } = useOralBoardsQuestion();
  return <output aria-label="Current question">{currentQuestion}</output>;
}

function Harness() {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsExtension agentId="oral-boards" />
      <CurrentQuestion />
    </OralBoardsQuestionProvider>
  );
}

describe("OralBoardsExtension", () => {
  it("mirrors current_question when a stable agent object receives state updates", () => {
    const { rerender } = render(<Harness />);

    stableAgent.state = {
      current_question: "What is your immediate management plan?",
    };
    rerender(<Harness />);

    expect(screen.getByLabelText("Current question")).toHaveTextContent(
      "What is your immediate management plan?",
    );
  });
});
