import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";
import type { Agent } from "./agent-card";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AgentCard } from "./agent-card";

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
  it("renders loading state", async () => {
    await renderSmoke("agent-card-loading", <AgentCard agent={agent} index={0} status="loading" />);
  });

  it("renders ok state", async () => {
    await renderSmoke("agent-card-ok", <AgentCard agent={{ ...agent, theme: "wellness" }} index={1} status="ok" />);
  });

  it("renders error state", async () => {
    await renderSmoke("agent-card-error", <AgentCard agent={{ ...agent, theme: "a2ui" }} index={2} status="error" />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("agent-card", <AgentCard agent={agent} index={0} />);
  });
});
