"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { HotelRoomsToolCall } from "../../tool-calls/hotel-rooms";
import { hotelRoomsSchema } from "../generated-tool-schemas";

export function HotelRoomsToolRenderRegistration() {
  useRenderTool({
    name: "hotel_rooms",
    parameters: hotelRoomsSchema,
    render: ({ status, parameters, result }) => (
      <HotelRoomsToolCall status={status} name="hotel_rooms" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
