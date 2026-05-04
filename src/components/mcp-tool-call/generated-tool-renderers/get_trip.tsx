"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { getTripSchema } from "../generated-tool-schemas";

export function GetTripToolRenderRegistration() {
  useRenderTool({
    name: "get_trip",
    parameters: getTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
