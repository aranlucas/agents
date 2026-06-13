import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke } from "@/test/test-utils";

vi.mock("@/hooks/use-agent-warmup", () => ({
  useAgentWarmup: () => ({
    runningCount: 5,
    total: 7,
    isLoading: false,
  }),
}));

import { AgentStatusBar } from "./agent-status-bar";

describe("AgentStatusBar", () => {
  it("renders", async () => {
    await renderSmoke("agent-status-bar", <AgentStatusBar />);
  });
});
