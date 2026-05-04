"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { testProviderSchema } from "../generated-tool-schemas";

export function TestProviderToolRenderRegistration() {
  useRenderTool({
    name: "test_provider",
    parameters: testProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="test_provider" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
