// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-agent-warmup", () => ({
  useAgentWarmup: vi.fn(),
}));

import { useAgentWarmup } from "@/hooks/use-agent-warmup";
import { AgentStatusBar } from "./agent-status-bar";

const mock = vi.mocked(useAgentWarmup);

const getDotClasses = (container: HTMLElement) => {
  const dot = container.querySelector("span.rounded-full");
  expect(dot).not.toBeNull();
  return Array.from(dot!.classList);
};

describe("AgentStatusBar", () => {
  it("shows 'checking agents…' while loading", () => {
    mock.mockReturnValue({ runningCount: 0, total: 7, isLoading: true, statuses: {} as never });
    render(<AgentStatusBar />);
    expect(screen.getByText("checking agents…")).toBeInTheDocument();
  });

  it("shows running count and CopilotKit label when loaded", () => {
    mock.mockReturnValue({ runningCount: 5, total: 7, isLoading: false, statuses: {} as never });
    render(<AgentStatusBar />);
    expect(screen.getByText("5 / 7 running · CopilotKit × ADK")).toBeInTheDocument();
  });

  it("shows 1 / 7 count correctly", () => {
    mock.mockReturnValue({ runningCount: 1, total: 7, isLoading: false, statuses: {} as never });
    render(<AgentStatusBar />);
    expect(screen.getByText("1 / 7 running · CopilotKit × ADK")).toBeInTheDocument();
  });

  it("applies success dot class when all agents are running", () => {
    mock.mockReturnValue({ runningCount: 7, total: 7, isLoading: false, statuses: {} as never });
    const { container } = render(<AgentStatusBar />);
    const classes = getDotClasses(container);
    expect(classes).toContain("bg-(--success)");
  });

  it("applies destructive dot class when no agents are running", () => {
    mock.mockReturnValue({ runningCount: 0, total: 7, isLoading: false, statuses: {} as never });
    const { container } = render(<AgentStatusBar />);
    const classes = getDotClasses(container);
    expect(classes).toContain("bg-destructive");
  });

  it("applies warning dot class when some agents are running", () => {
    mock.mockReturnValue({ runningCount: 3, total: 7, isLoading: false, statuses: {} as never });
    const { container } = render(<AgentStatusBar />);
    const classes = getDotClasses(container);
    expect(classes).toContain("bg-(--warning)");
  });
});
