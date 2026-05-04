"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { nearbyPlacesSchema } from "../generated-tool-schemas";

export function NearbyPlacesToolRenderRegistration() {
  useRenderTool({
    name: "nearby_places",
    parameters: nearbyPlacesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="nearby_places" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
