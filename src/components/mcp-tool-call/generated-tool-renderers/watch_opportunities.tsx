"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { watchOpportunitiesSchema } from "../generated-tool-schemas";

export function WatchOpportunitiesToolRenderRegistration() {
  useRenderTool({
    name: "watch_opportunities",
    parameters: watchOpportunitiesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_opportunities" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
