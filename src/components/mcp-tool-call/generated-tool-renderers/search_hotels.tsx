"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchHotelsToolCall } from "../../tool-calls/search-hotels";
import { searchHotelsSchema } from "../generated-tool-schemas";

export function SearchHotelsToolRenderRegistration() {
  useRenderTool({
    name: "search_hotels",
    parameters: searchHotelsSchema,
    render: ({ status, parameters, result }) => (
      <SearchHotelsToolCall status={status} name="search_hotels" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
