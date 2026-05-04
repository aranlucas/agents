"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { getBaggageRulesSchema } from "../generated-tool-schemas";

export function GetBaggageRulesToolRenderRegistration() {
  useRenderTool({
    name: "get_baggage_rules",
    parameters: getBaggageRulesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_baggage_rules" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
