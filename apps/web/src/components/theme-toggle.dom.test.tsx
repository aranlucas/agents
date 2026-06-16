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

describe("ThemeToggle", () => {
  it("renders a toggle button", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });

  it("shows Light, Dark, and System options in the dropdown", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual(["Light", "Dark", "System"]);
  });

  it("calls setTheme with 'light' when Light is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(await screen.findByRole("menuitem", { name: "Light" }));

    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme with 'dark' when Dark is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dark" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme with 'system' when System is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(await screen.findByRole("menuitem", { name: "System" }));

    expect(setTheme).toHaveBeenCalledWith("system");
  });
});
