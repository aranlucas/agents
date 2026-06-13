import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

const setTheme = vi.fn();

vi.mock("@/components/providers", () => ({
  useTheme: () => ({
    theme: "system" as const,
    resolvedTheme: "light" as const,
    setTheme,
  }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders", async () => {
    await renderSmoke("theme-toggle", <ThemeToggle />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("theme-toggle", <ThemeToggle />);
  });
});
