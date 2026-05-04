"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { optimizeBookingSchema } from "../generated-tool-schemas";

export function OptimizeBookingToolRenderRegistration() {
  useRenderTool({
    name: "optimize_booking",
    parameters: optimizeBookingSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_booking" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
