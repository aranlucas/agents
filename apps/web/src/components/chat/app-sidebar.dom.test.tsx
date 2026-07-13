// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@agents/ui";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
});
