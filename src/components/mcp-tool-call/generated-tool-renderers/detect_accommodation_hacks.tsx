"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { detectAccommodationHacksSchema } from "../generated-tool-schemas";

export function DetectAccommodationHacksToolRenderRegistration() {
  useRenderTool({
    name: "detect_accommodation_hacks",
    parameters: detectAccommodationHacksSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="detect_accommodation_hacks" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
