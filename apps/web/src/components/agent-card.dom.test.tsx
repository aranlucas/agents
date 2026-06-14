// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Agent } from "./agent-card";
import { AgentCard } from "./agent-card";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const base: Agent = {
  id: "travel",
  href: "/console/travel",
  name: "Travel Planner",
  tagline: "Plan",
  description: "Trip planning assistant",
  cta: "Open",
  tags: ["adk", "travel"],
  theme: "travel",
};

describe("AgentCard", () => {
  it("renders agent name, tagline, description", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.getByText("Travel Planner")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Trip planning assistant")).toBeInTheDocument();
  });

  it("renders tags as badges", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.getByText("adk")).toBeInTheDocument();
    expect(screen.getByText("travel")).toBeInTheDocument();
  });

  it("links to agent.href", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/console/travel");
  });

  it("displays 1-indexed zero-padded number from index", () => {
    render(<AgentCard agent={base} index={4} />);
    expect(screen.getByText("05")).toBeInTheDocument();
  });

  it("shows cta text", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows 'Checking' status for loading", () => {
    render(<AgentCard agent={base} index={0} status="loading" />);
    expect(screen.getByText("Checking")).toBeInTheDocument();
  });

  it("shows 'Running' status for ok", () => {
    render(<AgentCard agent={base} index={0} status="ok" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows 'Offline' status for error", () => {
    render(<AgentCard agent={base} index={0} status="error" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows no status badge when status is absent", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.queryByText("Checking")).not.toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });

  it("shows 'In-process' badge for wellness theme", () => {
    render(<AgentCard agent={{ ...base, theme: "wellness" }} index={0} />);
    expect(screen.getByText("In-process")).toBeInTheDocument();
  });

  it("shows 'A2UI' badge for a2ui theme", () => {
    render(<AgentCard agent={{ ...base, theme: "a2ui" }} index={0} />);
    expect(screen.getByText("A2UI")).toBeInTheDocument();
  });

  it("does not show special badges for other themes", () => {
    render(<AgentCard agent={base} index={0} />);
    expect(screen.queryByText("In-process")).not.toBeInTheDocument();
    expect(screen.queryByText("A2UI")).not.toBeInTheDocument();
  });
});
