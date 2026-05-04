"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { addBookingSchema } from "../generated-tool-schemas";

export function AddBookingToolRenderRegistration() {
  useRenderTool({
    name: "add_booking",
    parameters: addBookingSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="add_booking" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
