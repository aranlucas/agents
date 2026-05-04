"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { findTripWindowSchema } from "../generated-tool-schemas";

export function FindTripWindowToolRenderRegistration() {
  useRenderTool({
    name: "find_trip_window",
    parameters: findTripWindowSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="find_trip_window" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
