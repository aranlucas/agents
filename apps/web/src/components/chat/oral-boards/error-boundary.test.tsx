// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OralBoardsErrorBoundary, OralBoardsErrorFallback } from "./error-boundary";

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
    render(<OralBoardsErrorFallback error={new Error("render exploded")} resetError={onReset} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/render exploded/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start a new case/i }));

    expect(onReset).toHaveBeenCalledOnce();
  });
});
