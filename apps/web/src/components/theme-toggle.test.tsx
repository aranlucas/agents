import { describe, it, vi } from "vitest";
import { renderSmoke } from "@/test/test-utils";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    setTheme: vi.fn(),
  }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders", async () => {
    await renderSmoke("theme-toggle", <ThemeToggle />);
  });
});
