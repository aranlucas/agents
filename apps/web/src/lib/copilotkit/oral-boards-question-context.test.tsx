// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import React from "react";
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
          <button type="button" onClick={() => void respondToPendingInput("Irreversible pulpitis")}>
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

  it("keeps the examiner question pending when resume rejects", async () => {
    const respond = vi
      .fn()
      .mockRejectedValueOnce(new Error("resume disconnected"))
      .mockResolvedValueOnce(undefined);

    function RetryHarness() {
      const { pendingInputKind, registerPendingInput, respondToPendingInput } =
        useOralBoardsQuestion();
      const [error, setError] = React.useState("");

      return (
        <div>
          <output data-testid="pending-kind">{pendingInputKind ?? "none"}</output>
          <output>{error}</output>
          <button
            type="button"
            onClick={() =>
              registerPendingInput({
                id: "question-retry",
                kind: "answer",
                question: "What is your diagnosis?",
                respond,
              })
            }
          >
            Register retry
          </button>
          <button
            type="button"
            onClick={() =>
              void respondToPendingInput("Irreversible pulpitis").catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "resume failed");
              })
            }
          >
            Respond retry
          </button>
        </div>
      );
    }

    render(
      <OralBoardsQuestionProvider>
        <RetryHarness />
      </OralBoardsQuestionProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Register retry" }));
    await userEvent.click(screen.getByRole("button", { name: "Respond retry" }));
    expect(await screen.findByText("resume disconnected")).toBeInTheDocument();
    expect(screen.getByTestId("pending-kind")).toHaveTextContent("answer");

    await userEvent.click(screen.getByRole("button", { name: "Respond retry" }));
    expect(screen.getByTestId("pending-kind")).toHaveTextContent("none");
    expect(respond).toHaveBeenCalledTimes(2);
  });

  it("coalesces duplicate submissions while the resume request is in flight", async () => {
    let finishResponse: (() => void) | undefined;
    const respond = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResponse = resolve;
        }),
    );
    let submit: ((answer: string) => Promise<boolean>) | undefined;

    function DuplicateHarness() {
      const { pendingInputKind, registerPendingInput, respondToPendingInput } =
        useOralBoardsQuestion();
      React.useEffect(() => {
        submit = respondToPendingInput;
        return () => {
          submit = undefined;
        };
      }, [respondToPendingInput]);
      return (
        <div>
          <output>{pendingInputKind ?? "none"}</output>
          <button
            type="button"
            onClick={() =>
              registerPendingInput({
                id: "question-duplicate",
                kind: "answer",
                question: "What is your diagnosis?",
                respond,
              })
            }
          >
            Register duplicate
          </button>
        </div>
      );
    }

    render(
      <OralBoardsQuestionProvider>
        <DuplicateHarness />
      </OralBoardsQuestionProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Register duplicate" }));

    const first = submit?.("First answer");
    const duplicate = submit?.("Duplicate answer");
    expect(respond).toHaveBeenCalledOnce();
    await act(async () => {
      finishResponse?.();
      await expect(first).resolves.toBe(true);
      await expect(duplicate).resolves.toBe(true);
    });
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
