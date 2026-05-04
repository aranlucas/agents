"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { createTripSchema } from "../generated-tool-schemas";

export function CreateTripToolRenderRegistration() {
  useRenderTool({
    name: "create_trip",
    parameters: createTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="create_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
