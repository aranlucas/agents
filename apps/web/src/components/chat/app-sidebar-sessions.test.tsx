// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@agents/ui";

const mocks = vi.hoisted(() => ({
  sessions: [
    { id: "thread-current", name: "Plan Japan", lastUpdateTime: 1_783_900_000 },
    { id: "thread-older", lastUpdateTime: 1_783_800_000 },
  ],
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: { isRunning: false } }),
  UseAgentUpdate: { OnRunStatusChanged: "run-status" },
}));

vi.mock("./use-agent-sessions", () => ({
  useAgentSessions: () => ({
    data: mocks.sessions,
    isAuthenticated: true,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar session history", () => {
  beforeEach(() => {
    mocks.sessions = [
      { id: "thread-current", name: "Plan Japan", lastUpdateTime: 1_783_900_000 },
      { id: "thread-older", lastUpdateTime: 1_783_800_000 },
    ];
  });

  it("links every ADK session for the active agent and highlights the current thread", () => {
    render(
      <SidebarProvider defaultOpen>
        <AppSidebar agentId="travel" activeThreadId="thread-current" />
      </SidebarProvider>,
    );

    expect(screen.getByText("Trip Studio")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Plan Japan")).toBeInTheDocument();
    expect(document.querySelector('a[href="/console/travel/thread-current"]')).toHaveAttribute(
      "data-active",
    );
    expect(document.querySelector('a[href="/console/travel/thread-older"]')).toBeInTheDocument();
    expect(
      document.querySelector('a[href="/console/travel/thread-current"] [aria-hidden="true"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Sessions").closest('[data-slot="sidebar-group"]')).not.toHaveClass(
      "group-data-[collapsible=icon]:hidden",
    );
  });

  it("lists the current route before ADK persists its session", () => {
    mocks.sessions = [];

    render(
      <SidebarProvider defaultOpen>
        <AppSidebar agentId="grocery" activeThreadId="new-thread" />
      </SidebarProvider>,
    );

    expect(screen.getByText("Current session")).toBeInTheDocument();
    expect(document.querySelector('a[href="/console/grocery/new-thread"]')).toHaveAttribute(
      "data-active",
    );
  });
});
