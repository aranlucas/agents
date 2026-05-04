"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { listProvidersSchema } from "../generated-tool-schemas";

export function ListProvidersToolRenderRegistration() {
  useRenderTool({
    name: "list_providers",
    parameters: listProvidersSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_providers" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
