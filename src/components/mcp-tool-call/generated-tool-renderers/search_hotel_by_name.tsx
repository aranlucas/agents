"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchHotelByNameToolCall } from "../../tool-calls/search-hotel-by-name";
import { searchHotelByNameSchema } from "../generated-tool-schemas";

export function SearchHotelByNameToolRenderRegistration() {
  useRenderTool({
    name: "search_hotel_by_name",
    parameters: searchHotelByNameSchema,
    render: ({ status, parameters, result }) => (
      <SearchHotelByNameToolCall status={status} name="search_hotel_by_name" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
