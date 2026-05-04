"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { suggestProvidersSchema } from "../generated-tool-schemas";

export function SuggestProvidersToolRenderRegistration() {
  useRenderTool({
    name: "suggest_providers",
    parameters: suggestProvidersSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="suggest_providers" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
