"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { travelGuideSchema } from "../generated-tool-schemas";

export function TravelGuideToolRenderRegistration() {
  useRenderTool({
    name: "travel_guide",
    parameters: travelGuideSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="travel_guide" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
