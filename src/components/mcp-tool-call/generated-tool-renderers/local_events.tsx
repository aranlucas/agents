"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { LocalEventsToolCall } from "../../tool-calls/local-events";
import { localEventsSchema } from "../generated-tool-schemas";

export function LocalEventsToolRenderRegistration() {
  useRenderTool({
    name: "local_events",
    parameters: localEventsSchema,
    render: ({ status, parameters, result }) => (
      <LocalEventsToolCall status={status} name="local_events" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
