"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { searchLoungesSchema } from "../generated-tool-schemas";

export function SearchLoungesToolRenderRegistration() {
  useRenderTool({
    name: "search_lounges",
    parameters: searchLoungesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_lounges" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
