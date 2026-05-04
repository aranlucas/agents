"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchFlightsToolCall } from "../../tool-calls/search-flights";
import { searchFlightsSchema } from "../generated-tool-schemas";

export function SearchFlightsToolRenderRegistration() {
  useRenderTool({
    name: "search_flights",
    parameters: searchFlightsSchema,
    render: ({ status, parameters, result }) => (
      <SearchFlightsToolCall status={status} name="search_flights" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
