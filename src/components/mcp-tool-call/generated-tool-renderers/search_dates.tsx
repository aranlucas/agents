"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { searchDatesSchema } from "../generated-tool-schemas";

export function SearchDatesToolRenderRegistration() {
  useRenderTool({
    name: "search_dates",
    parameters: searchDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_dates" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
