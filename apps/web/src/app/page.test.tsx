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
  IntroductionSkeleton: () => <div>Writing introduction</div>,
}));

import Home from "./page";

describe("Portfolio home page", () => {
  it("leads with the thesis and the agent-written introduction", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /I build agentic products from idea to launch/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "About me" })).toBeVisible();
  });

  it("frames the page with site chrome", () => {
    render(<Home />);

    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Site" })).toBeVisible();
  });

  it("keeps only the three featured agents", () => {
    render(<Home />);

    const demoRoutes = ["/console/grocery", "/console/resume", "/console/trends"];
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));

    for (const route of demoRoutes) expect(hrefs).toContain(route);
    expect(hrefs).not.toContain("/console/travel");
  });

  it("uses the Resume agent as optional personal context", () => {
    render(<Home />);

    expect(screen.getByText(/The Resume agent will write this introduction/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Ask the Resume agent/i })).toHaveAttribute(
      "href",
      "/console/resume",
    );
  });

  it("names what each featured agent is wired to", () => {
    render(<Home />);

    expect(screen.getByText("Kroger cart")).toBeVisible();
    expect(screen.getByText("Google Trends")).toBeVisible();
  });

  it("links out to GitHub and LinkedIn", () => {
    render(<Home />);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("https://github.com/aranlucas");
    expect(hrefs).toContain("https://www.linkedin.com/in/lucasarango/");
  });

  it("does not publish an email address", () => {
    render(<Home />);

    expect(screen.queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link").some((link) => link.getAttribute("href")?.startsWith("mailto:")),
    ).toBe(false);
  });
});
