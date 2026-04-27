"""Itinerary agent with after_tool_callback for trip state updates."""
from __future__ import annotations

from typing import Optional
import time

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    ITINERARY_TOOLS,
    trvl_toolset,
    parse_tool_response,
    filter_mcp_tool_response,
)

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. 

When creating multi-destination trips (e.g., Seattle -> Vancouver -> Whistler -> Seattle):
1. Call create_trip first with a descriptive name
2. Add ALL trip legs using add_trip_leg in order - do NOT skip any legs
3. For road trips, use type="road_trip" and provider="personal_car" (or "rental_car")
4. For flights, use type="flight" and specify airline as provider
5. Ensure the complete route is captured: every destination must have a leg to it AND from it

After adding all legs, confirm the trip is complete by listing all legs back to the user.

Use itinerary tools to create, list, retrieve, update, mark booked, export calendars, and watch prices or rooms."""


async def itinerary_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle itinerary tool results: create_trip, add_trip_leg."""
    if tool.name not in ("create_trip", "add_trip_leg"):
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    data = parse_tool_response(tool_response)
    if not data or data.get("isError"):
        return None

    # Get or initialize active_trip in state (modifications are auto-tracked by ADK)
    if "active_trip" not in tool_context.state:
        tool_context.state["active_trip"] = {}

    trip = tool_context.state["active_trip"]

    if tool.name == "create_trip":
        trip["id"] = data.get("id", "")
        trip["name"] = data.get("name", "")
        trip["legs"] = []
        trip["updated_at"] = int(time.time())
    elif tool.name == "add_trip_leg":
        new_leg = data.get("leg")
        if not new_leg:
            print(f"[itinerary_callback] No leg in response data: {data}")
            return None
        
        print(f"[itinerary_callback] Adding leg: {new_leg}")
        print(f"[itinerary_callback] Current trip state: {trip}")
        
        # Check if there are hotels for this destination
        destination = new_leg.get("to", "")
        hotels_by_dest = trip.get("hotels_by_destination", {})
        if destination and destination in hotels_by_dest:
            new_leg["hotels"] = hotels_by_dest[destination]
        
        # Get current legs, default to empty list
        legs = trip.get("legs", [])
        if not isinstance(legs, list):
            legs = []
        
        # Append new leg
        legs.append(new_leg)
        trip["legs"] = legs
        
        # Update origin/destination from legs
        if legs:
            trip["origin"] = legs[0].get("from", "")
            trip["destination"] = legs[-1].get("to", "")
        
        trip["updated_at"] = int(time.time())
        print(f"[itinerary_callback] Updated trip state: {trip}")

    return filter_mcp_tool_response(tool, args, tool_context, tool_response)


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
