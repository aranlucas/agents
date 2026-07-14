// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@agents/ui";

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<{ id: string; name?: string; lastUpdateTime: number }>,
}));

vi.mock("./use-agent-sessions", () => ({
  useAgentSessions: () => ({ data: mocks.sessions }),
}));

import { ConsoleTopBar } from "./console-top-bar";

describe("ConsoleTopBar", () => {
  it("shows the agent, current session, and live run status", () => {
    render(
      <SidebarProvider>
        <ConsoleTopBar agentId="travel" threadId="new-thread" isRunning />
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Toggle Sidebar" })).toBeInTheDocument();
    expect(screen.getByText("Trip Studio")).toBeInTheDocument();
    expect(screen.getByText("Current session")).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("uses the persisted session name and ready state", () => {
    const lastUpdateTime = 1_783_900_000;
    mocks.sessions = [{ id: "saved-thread", name: "Plan Japan", lastUpdateTime }];

    render(
      <SidebarProvider>
        <ConsoleTopBar agentId="travel" threadId="saved-thread" isRunning={false} />
      </SidebarProvider>,
    );

    expect(screen.getByText("Plan Japan")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
