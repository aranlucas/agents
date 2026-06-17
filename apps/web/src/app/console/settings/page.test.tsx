// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserProfile: () => <div data-testid="user-profile">User Profile</div>,
}));

vi.mock("@/components/chat/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
  SETTINGS_PATH: "/console/settings",
}));

vi.mock("@agents/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agents/ui")>();
  return {
    ...actual,
    SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SidebarInset: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
    SidebarTrigger: () => <button type="button" aria-label="Toggle sidebar" />,
  };
});

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders the settings heading", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders the UserProfile component", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("user-profile")).toBeInTheDocument();
  });

  it("renders the AppSidebar", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
  });

  it("renders the sidebar toggle button", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeInTheDocument();
  });
});
