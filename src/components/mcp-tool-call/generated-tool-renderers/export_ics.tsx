"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { exportIcsSchema } from "../generated-tool-schemas";

export function ExportIcsToolRenderRegistration() {
  useRenderTool({
    name: "export_ics",
    parameters: exportIcsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="export_ics" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
