// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OralBoardsErrorBoundary, OralBoardsErrorFallback } from "./error-boundary";

// @sentry/nextjs ≥10.72 crashes vite-node at import time under jsdom: the
// vendored bundler plugin sniffs `document` (faked by jsdom) to decide it is
// in a browser and feeds an http: URL to fileURLToPath.
// Upstream: getsentry/sentry-javascript#23789 (fixed by #23906, unreleased).
// Mock the boundary here — same approach as oral-boards-workspace.test.tsx —
// and drop this mock once the SDK ships the fix. Our fallback UI stays tested.
vi.mock("@sentry/nextjs", async () => {
  const React = await import("react");
  type FallbackData = { error: unknown; resetError: () => void };
  type BoundaryProps = {
    children?: React.ReactNode;
    fallback?: React.ReactElement | React.ComponentType<FallbackData>;
    onReset?: () => void;
  };

  class ErrorBoundary extends React.Component<BoundaryProps, { error: unknown }> {
    state = { error: null };

    static getDerivedStateFromError(error: unknown) {
      return { error };
    }

    render() {
      if (!this.state.error) return this.props.children;
      const resetError = () => {
        this.props.onReset?.();
        this.setState({ error: null });
      };
      const { fallback } = this.props;
      if (!fallback) return null;
      if (React.isValidElement(fallback)) return fallback;
      return React.createElement(fallback, { error: this.state.error, resetError });
    }
  }

  return { ErrorBoundary };
});

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
