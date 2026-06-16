// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme }),
}));

import { ThemeToggle } from "./theme-toggle";

function getToggle() {
  const buttons = screen.getAllByRole("button");
  return buttons.find((b) => b.getAttribute("aria-haspopup") === "menu")!;
}

describe("ThemeToggle", () => {
  it("renders a toggle button", () => {
    render(<ThemeToggle />);
    expect(getToggle()).toBeInTheDocument();
  });

  it("shows Light, Dark, and System options in the dropdown", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(getToggle());

    expect(screen.getByRole("menuitem", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "System" })).toBeInTheDocument();
  });

  it("calls setTheme with 'light' when Light is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(getToggle());
    await user.click(screen.getByRole("menuitem", { name: "Light" }));

    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme with 'dark' when Dark is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(getToggle());
    await user.click(screen.getByRole("menuitem", { name: "Dark" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme with 'system' when System is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(getToggle());
    await user.click(screen.getByRole("menuitem", { name: "System" }));

    expect(setTheme).toHaveBeenCalledWith("system");
  });
});
