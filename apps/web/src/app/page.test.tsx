// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useUser: () => ({
    isLoaded: true,
    user: null,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useQuery: () => ({ data: null, isLoading: false, error: null }),
}));

import Home from "./page";

describe("Home page", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /Agents that coordinate useful work/i }),
    ).toBeInTheDocument();
  });

  it("renders the Planning system badge", () => {
    render(<Home />);
    expect(screen.getByText("Planning system")).toBeInTheDocument();
  });

  it("renders all agent cards", () => {
    render(<Home />);
    expect(screen.getByText("Whiteboard")).toBeInTheDocument();
    expect(screen.getByText("Trip Studio")).toBeInTheDocument();
    expect(screen.getByText("Grocery Studio")).toBeInTheDocument();
    expect(screen.getByText("Fitness Studio")).toBeInTheDocument();
    expect(screen.getByText("Wellness Studio")).toBeInTheDocument();
    expect(screen.getByText("Expense Desk")).toBeInTheDocument();
    expect(screen.getByText("Oral Boards")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Google Trends")).toBeInTheDocument();
    expect(screen.getAllByText("Research").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Spreadsheet")).toBeInTheDocument();
    expect(screen.getAllByText("Slides").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a single consolidated Oral Boards card (no separate v2)", () => {
    render(<Home />);
    expect(screen.getByText("Oral Boards")).toBeInTheDocument();
    expect(screen.queryByText("Oral Boards v2")).not.toBeInTheDocument();
  });

  it("does not surface the standalone A2UI showcase card", () => {
    render(<Home />);
    expect(screen.queryByText("A2UI Studio")).not.toBeInTheDocument();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/console/a2ui");
  });

  it("renders links to each agent console", () => {
    render(<Home />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/console/excalidraw");
    expect(hrefs).toContain("/console/travel");
    expect(hrefs).toContain("/console/grocery");
    expect(hrefs).toContain("/console/fitness");
    expect(hrefs).toContain("/console/wellness");
    expect(hrefs).toContain("/console/expense");
    expect(hrefs).toContain("/console/oral-boards");
    expect(hrefs).toContain("/console/resume");
    expect(hrefs).toContain("/console/trends");
    expect(hrefs).toContain("/console/research");
    expect(hrefs).toContain("/console/spreadsheet");
    expect(hrefs).toContain("/console/presentation");
  });

  it("names Trends and Resume in the landing description", () => {
    render(<Home />);
    expect(screen.getByText(/oral boards, trends, resume, research/i)).toBeInTheDocument();
  });

  it("renders the footer with agent labels", () => {
    render(<Home />);
    expect(screen.getAllByText("Grocery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Fitness").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Wellness orchestration")).toBeInTheDocument();
  });
});
