"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { testToolWithProgressSchema } from "../generated-tool-schemas";

export function TestToolWithProgressToolRenderRegistration() {
  useRenderTool({
    name: "test_tool_with_progress",
    parameters: testToolWithProgressSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="test_tool_with_progress" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
