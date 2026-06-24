// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OralBoardsQuestionProvider, useOralBoardsQuestion } from "./oral-boards-question-context";

describe("OralBoardsQuestionProvider", () => {
  it("tracks a pending examiner question and resolves it once", async () => {
    const respond = vi.fn();

    function ControlledHarness() {
      const { currentQuestion, pendingInputKind, registerPendingInput, respondToPendingInput } =
        useOralBoardsQuestion();

      return (
        <div>
          <output>{currentQuestion}</output>
          <output>{pendingInputKind ?? "none"}</output>
          <button
            type="button"
            onClick={() =>
              registerPendingInput({
                id: "question-1",
                kind: "answer",
                question: "What is your diagnosis?",
                respond,
              })
            }
          >
            Register
          </button>
          <button type="button" onClick={() => respondToPendingInput("Irreversible pulpitis")}>
            Respond
          </button>
        </div>
      );
    }

    render(
      <OralBoardsQuestionProvider>
        <ControlledHarness />
      </OralBoardsQuestionProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByText("What is your diagnosis?")).toBeInTheDocument();
    expect(screen.getByText("answer")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Respond" }));
    expect(respond).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({ answer: "Irreversible pulpitis" });
    expect(screen.getByText("none")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Respond" }));
    expect(respond).toHaveBeenCalledOnce();
  });
});
