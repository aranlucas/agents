"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { getWeatherSchema } from "../generated-tool-schemas";

export function GetWeatherToolRenderRegistration() {
  useRenderTool({
    name: "get_weather",
    parameters: getWeatherSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_weather" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
