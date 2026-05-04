"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { updatePreferencesSchema } from "../generated-tool-schemas";

export function UpdatePreferencesToolRenderRegistration() {
  useRenderTool({
    name: "update_preferences",
    parameters: updatePreferencesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="update_preferences" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
