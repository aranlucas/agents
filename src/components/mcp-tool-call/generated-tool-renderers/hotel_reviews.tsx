"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../../mcp-tool-call";
import { hotelReviewsSchema } from "../generated-tool-schemas";

export function HotelReviewsToolRenderRegistration() {
  useRenderTool({
    name: "hotel_reviews",
    parameters: hotelReviewsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="hotel_reviews" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
