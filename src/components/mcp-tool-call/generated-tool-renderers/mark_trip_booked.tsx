"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { markTripBookedSchema } from "../generated-tool-schemas";

export function MarkTripBookedToolRenderRegistration() {
  useRenderTool({
    name: "mark_trip_booked",
    parameters: markTripBookedSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="mark_trip_booked" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
