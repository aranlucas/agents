"use client";

import { useConfigureSuggestions } from "@copilotkit/react-core/v2";
import type { AgentConfig } from "./registry";

export function AgentSuggestions({ config }: { config: AgentConfig }) {
  useConfigureSuggestions({
    instructions: config.suggestionInstructions,
    minSuggestions: 1,
    maxSuggestions: 3,
    providerAgentId: config.id,
    consumerAgentId: config.id,
    available: "before-first-message",
  });
  return null;
}
