// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OralBoardsErrorBoundary } from "./error-boundary";

function Boom(): never {
  throw new Error("render exploded");
}

describe("OralBoardsErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors; keep test output pristine.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <OralBoardsErrorBoundary onReset={vi.fn()}>
        <p>exam content</p>
      </OralBoardsErrorBoundary>,
    );

    expect(screen.getByText("exam content")).toBeInTheDocument();
  });

  it("renders a fallback with a reset action instead of a blank screen", async () => {
    const onReset = vi.fn();
    render(
      <OralBoardsErrorBoundary onReset={onReset}>
        <Boom />
      </OralBoardsErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/render exploded/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start a new case/i }));

    expect(onReset).toHaveBeenCalledOnce();
  });
});
