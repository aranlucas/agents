"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { buildProfileSchema } from "../generated-tool-schemas";

export function BuildProfileToolRenderRegistration() {
  useRenderTool({
    name: "build_profile",
    parameters: buildProfileSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="build_profile" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
