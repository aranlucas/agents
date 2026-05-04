"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { WeekendGetawayToolCall } from "../../tool-calls/weekend-getaway";
import { weekendGetawaySchema } from "../generated-tool-schemas";

export function WeekendGetawayToolRenderRegistration() {
  useRenderTool({
    name: "weekend_getaway",
    parameters: weekendGetawaySchema,
    render: ({ status, parameters, result }) => (
      <WeekendGetawayToolCall status={status} name="weekend_getaway" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
