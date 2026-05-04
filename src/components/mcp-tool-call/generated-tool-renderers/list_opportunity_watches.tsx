"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { listOpportunityWatchesSchema } from "../generated-tool-schemas";

export function ListOpportunityWatchesToolRenderRegistration() {
  useRenderTool({
    name: "list_opportunity_watches",
    parameters: listOpportunityWatchesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_opportunity_watches" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
