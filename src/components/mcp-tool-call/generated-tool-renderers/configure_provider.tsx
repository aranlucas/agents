"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { configureProviderSchema } from "../generated-tool-schemas";

export function ConfigureProviderToolRenderRegistration() {
  useRenderTool({
    name: "configure_provider",
    parameters: configureProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="configure_provider" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
