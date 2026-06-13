import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke } from "@/test/test-utils";

vi.mock("@clerk/nextjs", () => ({
  UserProfile: () => <div data-user-profile />,
}));

vi.mock("@/components/chat/NavRail", () => ({
  NavRail: () => <div data-nav-rail />,
  SETTINGS_PATH: "/console/settings",
}));

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders", async () => {
    await renderSmoke("settings", <SettingsPage />);
  });
});
