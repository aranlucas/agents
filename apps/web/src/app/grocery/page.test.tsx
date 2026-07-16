// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import GroceryPage from "./page";

describe("Grocery landing page", () => {
  it("matches the accepted product promise and truthful capability boundary", () => {
    render(<GroceryPage />);

    expect(
      screen.getByRole("heading", {
        name: "Plan dinner. Build the list. Keep the final say.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/Connect Kroger when you want live products/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "From idea to aisle" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your list stays yours." })).toBeVisible();
    expect(screen.queryByText(/we don.t sell/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delivery/i)).not.toBeInTheDocument();
  });

  it("uses real links for every landing call to action", () => {
    render(<GroceryPage />);

    const webLinks = screen.getAllByRole("link", { name: "Try Grocery Agent" });
    const androidLinks = screen.getAllByRole("link", { name: "Android app coming soon" });

    expect(webLinks).toHaveLength(2);
    expect(androidLinks).toHaveLength(2);
    for (const link of webLinks) expect(link).toHaveAttribute("href", "/console/grocery");
    for (const link of androidLinks)
      expect(link).toHaveAttribute("href", "/grocery/support#android");

    expect(screen.getByRole("link", { name: "See deletion options" })).toHaveAttribute(
      "href",
      "/grocery/delete-account",
    );
  });
});
