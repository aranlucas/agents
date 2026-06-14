// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mockSetTheme = vi.fn();

vi.mock("@/components/providers", () => ({
  useTheme: vi.fn(),
}));

import { useTheme } from "@/components/providers";
import { ThemeToggle } from "./theme-toggle";

const mockUseTheme = vi.mocked(useTheme);

describe("ThemeToggle", () => {
  it("shows 'Use light theme' label for system theme", () => {
    mockUseTheme.mockReturnValue({ theme: "system", resolvedTheme: "light", setTheme: mockSetTheme });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Use light theme" })).toBeInTheDocument();
  });

  it("shows 'Use dark theme' label for light theme", () => {
    mockUseTheme.mockReturnValue({ theme: "light", resolvedTheme: "light", setTheme: mockSetTheme });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeInTheDocument();
  });

  it("shows 'Use system theme' label for dark theme", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme: mockSetTheme });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Use system theme" })).toBeInTheDocument();
  });

  it("cycles system → light when clicked", async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "system", resolvedTheme: "light", setTheme });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("cycles light → dark when clicked", async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "light", resolvedTheme: "light", setTheme });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("cycles dark → system when clicked", async () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("shows the current theme in the title attribute", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme: mockSetTheme });
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Theme: dark");
  });
});
