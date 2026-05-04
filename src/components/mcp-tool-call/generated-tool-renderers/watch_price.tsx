"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { watchPriceSchema } from "../generated-tool-schemas";

export function WatchPriceToolRenderRegistration() {
  useRenderTool({
    name: "watch_price",
    parameters: watchPriceSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_price" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
