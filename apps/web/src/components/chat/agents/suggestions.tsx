"use client";

import { useConfigureSuggestions } from "@copilotkit/react-core/v2";
import type { AgentConfig } from "./registry";

export function AgentSuggestions({ config }: { config: AgentConfig }) {
  useConfigureSuggestions(
    config.suggestions
      ? {
          suggestions: config.suggestions,
          available: "always",
        }
      : null,
  );
  return null;
}
