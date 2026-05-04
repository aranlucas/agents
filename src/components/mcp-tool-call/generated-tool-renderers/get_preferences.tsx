"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { getPreferencesSchema } from "../generated-tool-schemas";

export function GetPreferencesToolRenderRegistration() {
  useRenderTool({
    name: "get_preferences",
    parameters: getPreferencesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_preferences" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
