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

vi.mock("@/components/portfolio/generated-introduction", () => ({
  GeneratedIntroduction: () => (
    <div>
      <p>The Resume agent will write this introduction as you browse.</p>
      {/* oxlint-disable-next-line next/no-html-link-for-pages -- isolated Link test fixture */}
      <a href="/console/resume">Ask the Resume agent →</a>
    </div>
  ),
}));

import Home from "./page";

describe("Portfolio home page", () => {
  it("opens as a minimal personal index", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Hi, I’m Lucas." })).toBeInTheDocument();
    expect(
      screen.getByText("I’m exploring what agents can do by building them for my own life."),
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Portfolio" })).not.toBeInTheDocument();
  });

  it("presents the three ideas without a career chronology", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "What would I build for my own life?",
      }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "What should it research for me?" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "What should it finish?" })).toBeVisible();
    expect(
      screen.queryByText(/DoorDash|AWS|Amazon|senior software engineer/i),
    ).not.toBeInTheDocument();
  });

  it("keeps every working demo discoverable", () => {
    render(<Home />);

    const demoRoutes = [
      "/console/travel",
      "/console/grocery",
      "/console/fitness",
      "/console/wellness",
      "/console/expense",
      "/console/oral-boards",
      "/console/trends",
      "/console/research",
      "/console/spreadsheet",
      "/console/presentation",
    ];
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));

    for (const route of demoRoutes) expect(hrefs).toContain(route);
  });

  it("uses the Resume agent as optional personal context", () => {
    render(<Home />);

    expect(screen.getByText(/The Resume agent will write this introduction/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Ask the Resume agent/i })).toHaveAttribute(
      "href",
      "/console/resume",
    );
  });

  it("does not publish an email address", () => {
    render(<Home />);

    expect(screen.queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link").some((link) => link.getAttribute("href")?.startsWith("mailto:")),
    ).toBe(false);
  });
});
