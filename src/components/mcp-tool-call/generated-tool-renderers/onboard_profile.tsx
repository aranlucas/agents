"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { onboardProfileSchema } from "../generated-tool-schemas";

export function OnboardProfileToolRenderRegistration() {
  useRenderTool({
    name: "onboard_profile",
    parameters: onboardProfileSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="onboard_profile" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
