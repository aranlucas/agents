// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@agents/ui";

const mocks = vi.hoisted(() => ({
  threads: [
    { id: "thread-current", name: "Plan Japan", updatedAt: "2026-07-14T12:00:00Z" },
    { id: "thread-older", name: null, updatedAt: "2026-07-13T12:00:00Z" },
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

vi.mock("./console-threads", () => ({
  useConsoleThreads: () => ({
    threads: mocks.threads,
    isLoading: false,
    error: null,
    refetchThreads: vi.fn(),
    isAuthenticated: true,
  }),
}));

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar session history", () => {
  beforeEach(() => {
    mocks.threads = [
      { id: "thread-current", name: "Plan Japan", updatedAt: "2026-07-14T12:00:00Z" },
      { id: "thread-older", name: null, updatedAt: "2026-07-13T12:00:00Z" },
    ];
  });

  it("links every runtime thread for the active agent and highlights the current thread", () => {
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
    mocks.threads = [];

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
