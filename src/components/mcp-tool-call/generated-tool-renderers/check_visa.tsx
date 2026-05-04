"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { CheckVisaToolCall } from "../../tool-calls/check-visa";
import { checkVisaSchema } from "../generated-tool-schemas";

export function CheckVisaToolRenderRegistration() {
  useRenderTool({
    name: "check_visa",
    parameters: checkVisaSchema,
    render: ({ status, parameters, result }) => (
      <CheckVisaToolCall status={status} name="check_visa" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
