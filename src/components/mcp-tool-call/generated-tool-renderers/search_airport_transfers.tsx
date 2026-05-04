"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchAirportTransfersToolCall } from "../../tool-calls/search-airport-transfers";
import { searchAirportTransfersSchema } from "../generated-tool-schemas";

export function SearchAirportTransfersToolRenderRegistration() {
  useRenderTool({
    name: "search_airport_transfers",
    parameters: searchAirportTransfersSchema,
    render: ({ status, parameters, result }) => (
      <SearchAirportTransfersToolCall status={status} name="search_airport_transfers" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
