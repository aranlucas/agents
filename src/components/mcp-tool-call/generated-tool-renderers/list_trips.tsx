"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { listTripsSchema } from "../generated-tool-schemas";

export function ListTripsToolRenderRegistration() {
  useRenderTool({
    name: "list_trips",
    parameters: listTripsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_trips" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
