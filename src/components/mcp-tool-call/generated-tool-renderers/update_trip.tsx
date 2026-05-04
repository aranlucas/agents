"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { updateTripSchema } from "../generated-tool-schemas";

export function UpdateTripToolRenderRegistration() {
  useRenderTool({
    name: "update_trip",
    parameters: updateTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="update_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
