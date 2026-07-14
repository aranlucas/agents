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
  sessionReady: true,
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: agentMocks.agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: agentMocks.runAgent } }),
}));

vi.mock("@/components/chat/console-session", () => ({
  ConsoleSession: ({ children, loading }: { children: ReactNode; loading?: ReactNode }) => (
    <>{agentMocks.sessionReady ? children : loading}</>
  ),
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
  agentMocks.sessionReady = true;
});

describe("GeneratedIntroduction", () => {
  it("keeps the same skeleton height while the session starts", () => {
    agentMocks.sessionReady = false;
    agentMocks.runAgent.mockImplementation(() => new Promise<void>(() => undefined));

    const view = render(<GeneratedIntroduction />);
    const initialFrame = view.container.firstElementChild;

    expect(screen.getByLabelText("Resume agent is connecting")).toBeVisible();
    expect(initialFrame).toHaveClass("mt-4", "min-h-42");

    agentMocks.sessionReady = true;
    view.rerender(<GeneratedIntroduction />);

    expect(screen.getByLabelText("Resume agent is connecting")).toBeVisible();
    expect(view.container.firstElementChild).toHaveClass("mt-4", "min-h-42");
  });

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
    expect(screen.queryByRole("link", { name: /Ask the Resume agent/i })).not.toBeInTheDocument();

    agentMocks.agent.isRunning = true;
    agentMocks.agent.messages = [
      { id: "user-1", role: "user", content: "Write an introduction" },
      { id: "assistant-1", role: "assistant", content: "I build agents." },
    ];
    view.rerender(<GeneratedIntroduction />);

    const introParagraph = view.container.querySelector("p");
    expect(introParagraph).toHaveTextContent("I build agents.");
    expect(screen.queryByLabelText("Resume agent is connecting")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ask the Resume agent/i })).not.toBeInTheDocument();

    agentMocks.agent.isRunning = false;
    await act(async () => finishRun?.());
    expect(await screen.findByRole("link", { name: /Ask the Resume agent/i })).toBeVisible();
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
    expect(await screen.findByRole("link", { name: /Ask the Resume agent/i })).toHaveAttribute(
      "href",
      "/console/resume",
    );
  });
});
