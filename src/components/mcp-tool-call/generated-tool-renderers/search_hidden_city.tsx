"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { searchHiddenCitySchema } from "../generated-tool-schemas";

export function SearchHiddenCityToolRenderRegistration() {
  useRenderTool({
    name: "search_hidden_city",
    parameters: searchHiddenCitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_hidden_city" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
