"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { optimizeTripDatesSchema } from "../generated-tool-schemas";

export function OptimizeTripDatesToolRenderRegistration() {
  useRenderTool({
    name: "optimize_trip_dates",
    parameters: optimizeTripDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_trip_dates" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
