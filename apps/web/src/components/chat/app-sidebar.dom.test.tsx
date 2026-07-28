// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider, SidebarTrigger } from "@agents/ui";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: undefined }),
  UseAgentUpdate: { OnRunStatusChanged: "run-status" },
}));

// The no-agent sidebar exercised here does not render any of these branches.
// Keep this DOM contract test isolated from the much larger agent registry and
// thread-query dependency graphs so it remains reliable under the root test
// suite's parallel workload.
vi.mock("@/components/agent-icon", () => ({
  AgentIcon: () => <svg aria-hidden="true" />,
}));

vi.mock("@/components/chat/agents/registry", () => ({
  getAgentConfig: () => undefined,
}));

vi.mock("@/components/chat/console-threads", () => ({
  useConsoleThreads: () => ({
    threads: [],
    isLoading: false,
    error: null,
    refetchThreads: vi.fn(),
    isAuthenticated: false,
  }),
}));

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  it("links the shared agent mark back to the all-agents catalog", () => {
    render(
      <SidebarProvider>
        <AppSidebar activePath="/console/presentation" />
      </SidebarProvider>,
    );

    const allAgentsLink = screen.getByLabelText("All agents");
    expect(allAgentsLink).toBeInstanceOf(HTMLAnchorElement);
    expect(allAgentsLink).toHaveAttribute("href", "/");
  });

  it("provides a visible control that expands the desktop sidebar", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar activePath="/console/presentation" />
        <main>
          <SidebarTrigger />
        </main>
      </SidebarProvider>,
    );

    const sidebar = document.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute("data-state", "collapsed");

    const trigger = document.querySelector('[data-slot="sidebar-trigger"]');
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger!);

    expect(sidebar).toHaveAttribute("data-state", "expanded");
  });
});
