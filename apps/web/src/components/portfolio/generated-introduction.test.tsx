// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
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
});

describe("GeneratedIntroduction", () => {
  it("starts the Resume agent when the component mounts", async () => {
    agentMocks.runAgent.mockImplementation(async () => undefined);
    render(<GeneratedIntroduction />);

    await waitFor(() => expect(agentMocks.runAgent).toHaveBeenCalledTimes(1));
    expect(agentMocks.agent.addMessage).toHaveBeenCalledTimes(1);
  });

  it("shows the loading skeleton before assistant text arrives", async () => {
    let finishRun: (() => void) | undefined;
    agentMocks.runAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );

    const view = render(<GeneratedIntroduction />);

    expect(await screen.findByLabelText("Resume agent is connecting")).toBeVisible();

    agentMocks.agent.isRunning = true;
    agentMocks.agent.messages = [
      { id: "user-1", role: "user", content: "Write an introduction" },
      { id: "assistant-1", role: "assistant", content: "I build agents." },
    ];
    view.rerender(<GeneratedIntroduction />);

    const introParagraph = view.container.querySelector("p");
    expect(introParagraph).toHaveTextContent("I build agents.");
    expect(screen.queryByLabelText("Resume agent is connecting")).not.toBeInTheDocument();

    agentMocks.agent.isRunning = false;
    await act(async () => finishRun?.());
  });

  it("does not start multiple times in a row", async () => {
    agentMocks.runAgent.mockImplementation(async () => undefined);

    const view = render(<GeneratedIntroduction />);
    view.rerender(<GeneratedIntroduction />);

    await waitFor(() => expect(agentMocks.runAgent).toHaveBeenCalledTimes(1));
  });

  it("keeps a direct Resume agent path when generation fails", async () => {
    agentMocks.runAgent.mockRejectedValue(new Error("unavailable"));
    render(<GeneratedIntroduction />);

    expect(await screen.findByText("The introduction is unavailable right now.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Ask the Resume agent/i })).toHaveAttribute(
      "href",
      "/console/resume",
    );
  });
});
