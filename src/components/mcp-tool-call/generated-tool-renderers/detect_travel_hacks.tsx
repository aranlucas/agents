"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { detectTravelHacksSchema } from "../generated-tool-schemas";

export function DetectTravelHacksToolRenderRegistration() {
  useRenderTool({
    name: "detect_travel_hacks",
    parameters: detectTravelHacksSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="detect_travel_hacks" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
