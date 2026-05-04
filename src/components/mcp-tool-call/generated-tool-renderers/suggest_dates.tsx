"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { suggestDatesSchema } from "../generated-tool-schemas";

export function SuggestDatesToolRenderRegistration() {
  useRenderTool({
    name: "suggest_dates",
    parameters: suggestDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="suggest_dates" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
