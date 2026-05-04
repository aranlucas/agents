"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { PlanFlightBundleToolCall } from "../../tool-calls/plan-flight-bundle";
import { planFlightBundleSchema } from "../generated-tool-schemas";

export function PlanFlightBundleToolRenderRegistration() {
  useRenderTool({
    name: "plan_flight_bundle",
    parameters: planFlightBundleSchema,
    render: ({ status, parameters, result }) => (
      <PlanFlightBundleToolCall status={status} name="plan_flight_bundle" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
