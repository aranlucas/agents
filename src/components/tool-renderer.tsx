"use client";

import { useDefaultRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "./mcp-tool-call";

export function ToolRenderer() {
  useDefaultRenderTool({
    render: ({ name, status, args, result }) => {
      return (
        <McpToolCall status={status} name={name} args={args} result={result} />
      );
    },
  });
  return null;
}
