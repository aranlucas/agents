"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { AssessTripToolCall } from "../../tool-calls/assess-trip";
import { assessTripSchema } from "../generated-tool-schemas";

export function AssessTripToolRenderRegistration() {
  useRenderTool({
    name: "assess_trip",
    parameters: assessTripSchema,
    render: ({ status, parameters, result }) => (
      <AssessTripToolCall status={status} name="assess_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
