"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { HotelPricesToolCall } from "../../tool-calls/hotel-prices";
import { hotelPricesSchema } from "../generated-tool-schemas";

export function HotelPricesToolRenderRegistration() {
  useRenderTool({
    name: "hotel_prices",
    parameters: hotelPricesSchema,
    render: ({ status, parameters, result }) => (
      <HotelPricesToolCall status={status} name="hotel_prices" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
