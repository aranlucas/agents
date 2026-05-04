"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchDealsToolCall } from "../../tool-calls/search-deals";
import { searchDealsSchema } from "../generated-tool-schemas";

export function SearchDealsToolRenderRegistration() {
  useRenderTool({
    name: "search_deals",
    parameters: searchDealsSchema,
    render: ({ status, parameters, result }) => (
      <SearchDealsToolCall status={status} name="search_deals" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
