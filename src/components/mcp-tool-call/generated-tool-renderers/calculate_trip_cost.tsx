"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { calculateTripCostSchema } from "../generated-tool-schemas";

export function CalculateTripCostToolRenderRegistration() {
  useRenderTool({
    name: "calculate_trip_cost",
    parameters: calculateTripCostSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="calculate_trip_cost" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
