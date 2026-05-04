"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { findInteractiveSchema } from "../generated-tool-schemas";

export function FindInteractiveToolRenderRegistration() {
  useRenderTool({
    name: "find_interactive",
    parameters: findInteractiveSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="find_interactive" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
