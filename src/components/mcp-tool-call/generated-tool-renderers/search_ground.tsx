"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchGroundToolCall } from "../../tool-calls/search-ground";
import { searchGroundSchema } from "../generated-tool-schemas";

export function SearchGroundToolRenderRegistration() {
  useRenderTool({
    name: "search_ground",
    parameters: searchGroundSchema,
    render: ({ status, parameters, result }) => (
      <SearchGroundToolCall status={status} name="search_ground" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
