"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { watchRoomAvailabilitySchema } from "../generated-tool-schemas";

export function WatchRoomAvailabilityToolRenderRegistration() {
  useRenderTool({
    name: "watch_room_availability",
    parameters: watchRoomAvailabilitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_room_availability" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
