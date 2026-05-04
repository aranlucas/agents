"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { destinationInfoSchema } from "../generated-tool-schemas";

export function DestinationInfoToolRenderRegistration() {
  useRenderTool({
    name: "destination_info",
    parameters: destinationInfoSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="destination_info" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
