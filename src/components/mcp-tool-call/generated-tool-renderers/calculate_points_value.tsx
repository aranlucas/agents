"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { calculatePointsValueSchema } from "../generated-tool-schemas";

export function CalculatePointsValueToolRenderRegistration() {
  useRenderTool({
    name: "calculate_points_value",
    parameters: calculatePointsValueSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="calculate_points_value" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
