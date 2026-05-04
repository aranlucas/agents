"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { interviewTripSchema } from "../generated-tool-schemas";

export function InterviewTripToolRenderRegistration() {
  useRenderTool({
    name: "interview_trip",
    parameters: interviewTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="interview_trip" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
