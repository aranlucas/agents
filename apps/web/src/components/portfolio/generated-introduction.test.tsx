// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({
  agent: {
    addMessage: vi.fn(),
    isRunning: false,
    messages: [] as Array<{ id: string; role: string; content: string }>,
  },
  runAgent: vi.fn<() => Promise<void>>(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: agentMocks.agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: agentMocks.runAgent } }),
}));

vi.mock("@/components/chat/console-session", () => ({
  ConsoleSession: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { GeneratedIntroduction } from "./generated-introduction";

beforeEach(() => {
  agentMocks.agent.messages = [];
  agentMocks.agent.isRunning = false;
  agentMocks.agent.addMessage.mockClear();
  agentMocks.runAgent.mockReset();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("GeneratedIntroduction", () => {
  it("starts the Resume agent with useAgent on the first scroll only", async () => {
    agentMocks.runAgent.mockImplementation(async () => undefined);
    render(<GeneratedIntroduction />);

    expect(agentMocks.runAgent).not.toHaveBeenCalled();
    fireEvent.scroll(window);
    fireEvent.scroll(window);

    await waitFor(() => expect(agentMocks.runAgent).toHaveBeenCalledTimes(1));
    expect(agentMocks.agent.addMessage).toHaveBeenCalledTimes(1);
  });

  it("starts immediately if the provider becomes ready after the visitor has scrolled", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
    agentMocks.runAgent.mockImplementation(async () => undefined);

    render(<GeneratedIntroduction />);

    await waitFor(() => expect(agentMocks.runAgent).toHaveBeenCalledTimes(1));
  });

  it("replaces the shimmer with partial assistant text while the AG-UI run is active", async () => {
    let finishRun: (() => void) | undefined;
    agentMocks.runAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    const view = render(<GeneratedIntroduction />);

    fireEvent.scroll(window);
    expect(await screen.findByLabelText("Resume agent is connecting")).toBeVisible();

    agentMocks.agent.isRunning = true;
    agentMocks.agent.messages = [
      { id: "user-1", role: "user", content: "Write an introduction" },
      { id: "assistant-1", role: "assistant", content: "I build agents" },
    ];
    view.rerender(<GeneratedIntroduction />);

    expect(screen.getByText("I build agents")).toBeVisible();
    expect(screen.queryByLabelText("Resume agent is connecting")).not.toBeInTheDocument();

    agentMocks.agent.isRunning = false;
    await act(async () => finishRun?.());
  });

  it("keeps a direct Resume agent path when generation fails", async () => {
    agentMocks.runAgent.mockRejectedValue(new Error("unavailable"));
    render(<GeneratedIntroduction />);

    fireEvent.scroll(window);

    expect(await screen.findByText("The introduction is unavailable right now.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Ask the Resume agent/i })).toHaveAttribute(
      "href",
      "/console/resume",
    );
  });
});
