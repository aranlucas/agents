// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OralBoardsState } from "@agents/types";

const copilotMocks = vi.hoisted(() => {
  const agent: {
    addMessage: (...args: unknown[]) => void;
    setState: (...args: unknown[]) => void;
    isRunning: boolean;
    state: OralBoardsState;
  } = {
    addMessage: vi.fn(),
    setState: vi.fn(),
    isRunning: false,
    state: {},
  };
  return { agent, runAgent: vi.fn(async () => undefined) };
});

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "OnStateChanged", OnRunStatusChanged: "OnRunStatusChanged" },
  useAgent: () => ({ agent: copilotMocks.agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: copilotMocks.runAgent } }),
  CopilotSidebar: () => null,
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
  OralBoardsPanel: ({ onClose }: { onClose: () => void }) => {
    if (panelMocks.shouldThrow) throw new Error("panel exploded");
    return (
      <div data-testid="oral-boards-panel">
        <button type="button" onClick={onClose}>
          panel close
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
    copilotMocks.agent.addMessage.mockClear();
    copilotMocks.agent.setState.mockClear();
    copilotMocks.runAgent.mockReset().mockResolvedValue(undefined);
    newThreadMocks.startNewThread.mockClear();
    panelMocks.shouldThrow = false;
  });

  it("renders the start page when there is no case yet", () => {
    render(<OralBoardsWorkspace />);

    expect(screen.getByRole("button", { name: "Start a case" })).toBeInTheDocument();
    expect(screen.queryByTestId("oral-boards-panel")).not.toBeInTheDocument();
  });

  it("renders the exam panel once the agent state has a case", () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };

    render(<OralBoardsWorkspace />);

    expect(screen.getByTestId("oral-boards-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a case" })).not.toBeInTheDocument();
  });

  it("replaces a crashing panel with the error boundary fallback instead of blanking the page", () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };
    panelMocks.shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<OralBoardsWorkspace />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByTestId("oral-boards-panel")).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("fires the boundary's reset action (start a new thread) from the fallback", async () => {
    copilotMocks.agent.state = { case: "A case vignette.", status: "presenting" };
    panelMocks.shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<OralBoardsWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: /start a new case/i }));

    expect(newThreadMocks.startNewThread).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("shows a retry banner when starting a case rejects, and Retry re-fires the same action", async () => {
    copilotMocks.runAgent.mockReset().mockRejectedValueOnce(new Error("agent unreachable"));

    render(<OralBoardsWorkspace />);
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
});
