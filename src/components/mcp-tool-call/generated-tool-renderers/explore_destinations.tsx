"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { ExploreDestinationsToolCall } from "../../tool-calls/explore-destinations";
import { exploreDestinationsSchema } from "../generated-tool-schemas";

export function ExploreDestinationsToolRenderRegistration() {
  useRenderTool({
    name: "explore_destinations",
    parameters: exploreDestinationsSchema,
    render: ({ status, parameters, result }) => (
      <ExploreDestinationsToolCall status={status} name="explore_destinations" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
