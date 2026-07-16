// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import GroceryDeleteAccountPage from "./delete-account/page";
import GroceryLayout from "./layout";
import GroceryPrivacyPage from "./privacy/page";
import GrocerySupportPage from "./support/page";
import GroceryTermsPage from "./terms/page";

afterEach(cleanup);

describe("Grocery public policy surfaces", () => {
  it("provides stable navigation without replacing the personal root", () => {
    render(
      <GroceryLayout>
        <div>Public grocery content</div>
      </GroceryLayout>,
    );

    expect(screen.getAllByRole("link", { name: "Grocery Agent home" })).toHaveLength(2);
    expect(screen.getByRole("navigation", { name: "Grocery Agent" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Try it on the web" })).toHaveAttribute(
      "href",
      "/console/grocery",
    );
    expect(screen.getByRole("link", { name: "Delete account" })).toHaveAttribute(
      "href",
      "/grocery/delete-account",
    );
  });

  it("explains privacy processing without an unsupported no-sale claim", () => {
    render(<GroceryPrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
    expect(
      screen.getByText(/Automated deletion of all account-associated app data/i),
    ).toBeVisible();
    expect(screen.queryByText(/we don.t sell/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "aranlucas@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20privacy",
    );
  });

  it("sets the retailer and AI review boundaries in the terms", () => {
    render(<GroceryTermsPage />);

    expect(
      screen.getByText(/not a grocery retailer, delivery provider, or payment processor/i),
    ).toBeVisible();
    expect(screen.getByText(/AI output can be incomplete or wrong/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
      "href",
      "/grocery/privacy",
    );
  });

  it("offers real support paths and marks the Android listing as unavailable", () => {
    render(<GrocerySupportPage />);

    expect(screen.getByRole("link", { name: /Email support/i })).toHaveAttribute(
      "href",
      "mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20support",
    );
    expect(screen.getByRole("link", { name: /Report a public bug/i })).toHaveAttribute(
      "href",
      "https://github.com/aranlucas/agents/issues/new?title=Grocery%20Agent%20bug",
    );
    expect(screen.getByText(/There is not yet a verified Google Play listing/i)).toBeVisible();
  });

  it("describes separate manual deletion paths instead of pretending deletion is automatic", () => {
    render(<GroceryDeleteAccountPage />);

    expect(screen.getByText(/Opening this page does not delete anything/i)).toBeVisible();
    expect(screen.getByText(/reviewed and handled manually today/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Open account settings/i })).toHaveAttribute(
      "href",
      "/console/settings",
    );
    expect(screen.getByRole("link", { name: /Email a deletion request/i })).toHaveAttribute(
      "href",
      "mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20data%20deletion%20request",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
