"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { optimizeMultiCitySchema } from "../generated-tool-schemas";

export function OptimizeMultiCityToolRenderRegistration() {
  useRenderTool({
    name: "optimize_multi_city",
    parameters: optimizeMultiCitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_multi_city" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
