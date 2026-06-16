import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke } from "@/test/test-utils";

vi.mock("@clerk/nextjs", () => ({
  UserProfile: () => <div data-user-profile />,
}));

vi.mock("@/components/chat/app-sidebar", () => ({
  AppSidebar: () => <div data-app-sidebar />,
  SETTINGS_PATH: "/console/settings",
}));

vi.mock("@agents/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agents/ui")>();
  return {
    ...actual,
    SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SidebarInset: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
    SidebarTrigger: () => <button aria-label="Toggle sidebar" />,
  };
});

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders", async () => {
    await renderSmoke("settings", <SettingsPage />);
  });
});
