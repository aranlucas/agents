import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-agent-warmup", () => ({
  useAgentWarmup: () => ({
    runningCount: 5,
    total: 7,
    isLoading: false,
  }),
}));

import { AgentStatusBar } from "./agent-status-bar";

describe("AgentStatusBar", () => {
  it("renders", () => {
    expect(() => render(<AgentStatusBar />)).not.toThrow();
  });
});
