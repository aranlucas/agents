"use client";

import { useDefaultRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "./mcp-tool-call";

export function ToolRenderer() {
  useDefaultRenderTool({
    render: ({ name, status, parameters, result }) => {
      return (
        <McpToolCall status={status} name={name} args={parameters} result={result} />
      );
    },
  });
  return null;
}
