"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { providerHealthSchema } from "../generated-tool-schemas";

export function ProviderHealthToolRenderRegistration() {
  useRenderTool({
    name: "provider_health",
    parameters: providerHealthSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="provider_health" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
