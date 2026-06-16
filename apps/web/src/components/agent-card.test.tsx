import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AgentCard } from "./agent-card";
import type { Agent } from "./agent-card";

const agent: Agent = {
  id: "travel",
  href: "/travel",
  name: "Travel",
  tagline: "Plan",
  description: "Trip planning",
  cta: "Open",
  tags: ["adk"],
  theme: "travel",
};

describe("AgentCard", () => {
  it("renders loading state", () => {
    expect(() =>
      render(<AgentCard agent={agent} index={0} status="loading" />),
    ).not.toThrow();
  });

  it("renders ok state", () => {
    expect(() =>
      render(<AgentCard agent={{ ...agent, theme: "wellness" }} index={1} status="ok" />),
    ).not.toThrow();
  });

  it("renders error state", () => {
    expect(() =>
      render(<AgentCard agent={{ ...agent, theme: "a2ui" }} index={2} status="error" />),
    ).not.toThrow();
  });

  it("renders without throwing", () => {
    expect(() => render(<AgentCard agent={agent} index={0} />)).not.toThrow();
  });
});
