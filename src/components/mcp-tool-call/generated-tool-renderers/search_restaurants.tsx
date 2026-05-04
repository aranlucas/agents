"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchRestaurantsToolCall } from "../../tool-calls/search-restaurants";
import { searchRestaurantsSchema } from "../generated-tool-schemas";

export function SearchRestaurantsToolRenderRegistration() {
  useRenderTool({
    name: "search_restaurants",
    parameters: searchRestaurantsSchema,
    render: ({ status, parameters, result }) => (
      <SearchRestaurantsToolCall status={status} name="search_restaurants" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
