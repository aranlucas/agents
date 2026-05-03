"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import McpToolCall from "./McpToolCall";

export function ToolRenderer() {
  useFrontendTool({
    name: "*",
    render: ({ name, status, args, result }) => {
      return (
        <McpToolCall status={status} name={name} args={args} result={result} />
      );
    },
  });
  return null;
}
