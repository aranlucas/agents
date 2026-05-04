"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { SearchAwardsToolCall } from "../../tool-calls/search-awards";
import { searchAwardsSchema } from "../generated-tool-schemas";

export function SearchAwardsToolRenderRegistration() {
  useRenderTool({
    name: "search_awards",
    parameters: searchAwardsSchema,
    render: ({ status, parameters, result }) => (
      <SearchAwardsToolCall status={status} name="search_awards" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
