"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { removeProviderSchema } from "../generated-tool-schemas";

export function RemoveProviderToolRenderRegistration() {
  useRenderTool({
    name: "remove_provider",
    parameters: removeProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="remove_provider" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
