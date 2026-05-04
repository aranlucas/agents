"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { PlanTripToolCall } from "../../tool-calls/plan-trip";
import { planTripSchema } from "../generated-tool-schemas";

export function PlanTripToolRenderRegistration() {
  useRenderTool({
    name: "plan_trip",
    parameters: planTripSchema,
    render: ({ status, parameters, result }) => (
      <PlanTripToolCall status={status} name="plan_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
