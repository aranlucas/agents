"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchRouteToolCall } from "../../tool-calls/search-route";
import { searchRouteSchema } from "../generated-tool-schemas";

export function SearchRouteToolRenderRegistration() {
  useRenderTool({
    name: "search_route",
    parameters: searchRouteSchema,
    render: ({ status, parameters, result }) => (
      <SearchRouteToolCall status={status} name="search_route" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
