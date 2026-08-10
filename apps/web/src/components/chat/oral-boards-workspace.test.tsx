// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OralBoardsState } from "@agents/types";

type AgentMethodMock = ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

const copilotMocks = vi.hoisted(() => {
  const agent: {
    addMessage: AgentMethodMock;
    setState: AgentMethodMock;
    isRunning: boolean;
    state: OralBoardsState;
  } = {
    addMessage: vi.fn(),
    setState: vi.fn(),
    isRunning: false,
    state: {},
  };
  return {
    agent,
    agentAvailable: true,
    copilotChat: vi.fn(() => null),
    runAgent: vi.fn(async () => undefined),
  };
});

const sentryMocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", async () => {
  const React = await import("react");
  type FallbackData = { error: unknown; resetError: () => void };
  type BoundaryProps = {
    children?: React.ReactNode;
    fallback?: React.ReactElement | ((data: FallbackData) => React.ReactElement);
    onReset?: () => void;
  };

  class ErrorBoundary extends React.Component<BoundaryProps, { error: unknown }> {
    state = { error: null };

    static getDerivedStateFromError(error: unknown) {
      return { error };
    }

    render() {
      if (!this.state.error) return this.props.children;
      if (typeof this.props.fallback !== "function") return this.props.fallback ?? null;
      return this.props.fallback({
        error: this.state.error,
        resetError: () => {
          this.props.onReset?.();
          this.setState({ error: null });
        },
      });
    }
  }

  return { captureException: sentryMocks.captureException, ErrorBoundary };
});

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "OnStateChanged", OnRunStatusChanged: "OnRunStatusChanged" },
  useAgent: () => ({ agent: copilotMocks.agentAvailable ? copilotMocks.agent : undefined }),
  useCopilotKit: () => ({ copilotkit: { runAgent: copilotMocks.runAgent } }),
  CopilotChat: copilotMocks.copilotChat,
}));

vi.mock("@/hooks/use-agent-warmup", () => ({
  useAgentWarmup: () => ({
    statuses: { "oral-boards": "ok" },
    runningCount: 0,
    total: 1,
    isLoading: false,
  }),
}));

vi.mock("@/components/chat/agents/registry", () => ({
  getAgentConfig: () => ({
    id: "oral-boards",
    label: "Oral Boards",
    glyph: "◆",
    colorVar: "--oral-boards",
    placeholder: "Start a pediatric dentistry oral-board case…",
  }),
}));

vi.mock("@/components/chat/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));

vi.mock("@/components/chat/console-top-bar", () => ({
  ConsoleTopBar: () => <div data-testid="console-top-bar" />,
}));

vi.mock("@/components/workspace-shell", () => ({
  useArtifactPanel: () => ({ state: "closed", dispatch: vi.fn() }),
}));

const newThreadMocks = vi.hoisted(() => ({ startNewThread: vi.fn() }));
vi.mock("@/components/chat/use-new-thread", () => ({
  useNewThread: () => newThreadMocks.startNewThread,
}));

vi.mock("@/components/chat/agents/extensions", () => ({
  AgentExtensionSlot: () => null,
}));

const panelMocks = vi.hoisted(() => ({ shouldThrow: false }));
vi.mock("@/components/chat/oral-boards/oral-boards-panel", () => ({
  OralBoardsPanel: ({
    onClose,
    onAnswer,
  }: {
    onClose: () => void;
    onAnswer: (text: string) => void;
  }) => {
    if (panelMocks.shouldThrow) throw new Error("panel exploded");
    return (
      <div data-testid="oral-boards-panel">
        <button type="button" onClick={onClose}>
          panel close
        </button>
        <button type="button" onClick={() => onAnswer("A clinical answer")}>
          submit mock answer
        </button>
      </div>
    );
  },
}));

import { OralBoardsWorkspace } from "./oral-boards-workspace";

describe("OralBoardsWorkspace", () => {
  beforeEach(() => {
    copilotMocks.agent.state = {};
    copilotMocks.agent.isRunning = false;
    copilotMocks.agentAvailable = true;
    copilotMocks.agent.addMessage.mockClear();
    copilotMocks.agent.setState.mockClear();
    copilotMocks.copilotChat.mockClear();
    copilotMocks.runAgent.mockReset().mockResolvedValue(undefined);
    sentryMocks.captureException.mockClear();
    newThreadMocks.startNewThread.mockClear();
    panelMocks.shouldThrow = false;
  });

  it("renders the start page when there is no case yet", () => {
    render(<OralBoardsWorkspace threadId="thread-1" />);

    expect(screen.getByRole("button", { name: "Start a case" })).toBeInTheDocument();
    expect(copilotMocks.copilotChat).toHaveBeenCalled();
    expect(screen.queryByTestId("oral-boards-panel")).not.toBeInTheDocument();
  });

  it("does not expose case controls until the new thread agent is connected", () => {
    copilotMocks.agentAvailable = false;

    render(<OralBoardsWorkspace threadId="thread-2" />);

    expect(screen.getByText("Connecting to the examiner…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a case" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dental trauma" })).not.toBeInTheDocument();
  });

  it("renders the exam panel once the agent state has a case", () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };

    render(<OralBoardsWorkspace threadId="thread-1" />);

    expect(screen.getByTestId("oral-boards-panel")).toBeInTheDocument();
    expect(screen.getByTestId("oral-boards-panel").parentElement).toHaveClass("w-full", "min-w-0");
    expect(screen.queryByRole("button", { name: "Start a case" })).not.toBeInTheDocument();
  });

  it("replaces a crashing panel with the error boundary fallback instead of blanking the page", () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };
    panelMocks.shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<OralBoardsWorkspace threadId="thread-1" />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByTestId("oral-boards-panel")).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("fires the boundary's reset action (start a new thread) from the fallback", async () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };
    panelMocks.shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<OralBoardsWorkspace threadId="thread-1" />);
    await userEvent.click(screen.getByRole("button", { name: /start a new case/i }));

    expect(newThreadMocks.startNewThread).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("shows a retry banner when starting a case rejects, and Retry re-fires the same action", async () => {
    copilotMocks.runAgent.mockReset().mockRejectedValueOnce(new Error("agent unreachable"));

    render(<OralBoardsWorkspace threadId="thread-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Start a case" }));

    await waitFor(() => {
      expect(screen.getByText("The examiner ran into a problem")).toBeInTheDocument();
    });
    expect(screen.getByText("agent unreachable")).toBeInTheDocument();

    copilotMocks.runAgent.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.queryByText("The examiner ran into a problem")).not.toBeInTheDocument();
    });
    expect(copilotMocks.runAgent).toHaveBeenCalledTimes(2);
  });

  it("offers reconnect when the saved case has no restored examiner interrupt", async () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "questioning" };

    render(<OralBoardsWorkspace threadId="thread-stale" />);
    await userEvent.click(screen.getByRole("button", { name: "submit mock answer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    });
    expect(screen.getByText(/examiner is not ready for an answer yet/i)).toBeInTheDocument();
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/not ready for an answer yet/i) }),
      { tags: { component: "oralboards_workspace", operation: "exam.answer" } },
    );
  });
});
