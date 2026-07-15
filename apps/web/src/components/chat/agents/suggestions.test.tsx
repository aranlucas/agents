import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configureSuggestions: vi.fn(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useConfigureSuggestions: mocks.configureSuggestions,
}));

import { getAgentConfig } from "./registry";
import { AgentSuggestions } from "./suggestions";

describe("AgentSuggestions", () => {
  it("asks the active agent to generate contextual starter suggestions", () => {
    const config = getAgentConfig("resume");

    render(<AgentSuggestions config={config} />);

    expect(mocks.configureSuggestions).toHaveBeenCalledWith({
      instructions: config.suggestionInstructions,
      minSuggestions: 1,
      maxSuggestions: 3,
      providerAgentId: "resume",
      consumerAgentId: "resume",
      available: "before-first-message",
    });
  });
});
