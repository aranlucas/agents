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

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  it("links the shared agent mark back to the all-agents catalog", () => {
    render(
      <SidebarProvider>
        <AppSidebar activePath="/console/presentation" />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/");
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
