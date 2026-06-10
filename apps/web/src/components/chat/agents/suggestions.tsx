"use client";

import { useConfigureSuggestions } from "@copilotkit/react-core/v2";
import type { AgentConfig } from "./registry";

export function AgentSuggestions({ config }: { config: AgentConfig }) {
  useConfigureSuggestions({
    suggestions: config.suggestions ?? [],
    available: "always",
  });
  return null;
}
