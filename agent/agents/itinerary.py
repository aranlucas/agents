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
)

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. Use itinerary tools
to create, list, retrieve, update, mark booked, export calendars, and watch prices or rooms."""


async def itinerary_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle itinerary tool results: create_trip, add_trip_leg."""
    if tool.name not in ("create_trip", "add_trip_leg"):
        return None

    data = parse_tool_response(tool_response)
    if not data or data.get("isError"):
        return None

    if tool.name == "create_trip":
        # Initialize a fresh trip state
        trip_id = data.get("id", "")
        trip_name = data.get("name", "")
        tool_context.state["active_trip"] = {
            "id": trip_id,
            "name": trip_name,
            "legs": [],
            "updated_at": int(time.time()),
        }
    elif tool.name == "add_trip_leg":
        new_leg = data.get("leg")
        if not new_leg:
            return None
        
        # Get or initialize the active trip
        current_trip = tool_context.state.get("active_trip", {})
        if not current_trip:
            current_trip = {"legs": []}
        
        # Append the new leg
        current_legs = current_trip.get("legs", [])
        updated_legs = current_legs + [new_leg]
        
        # Infer origin/destination from legs
        origin = updated_legs[0].get("from", "") if updated_legs else ""
        destination = updated_legs[-1].get("to", "") if updated_legs else ""
        
        # Update state directly
        tool_context.state["active_trip"] = {
            **current_trip,
            "legs": updated_legs,
            "origin": origin,
            "destination": destination,
            "updated_at": int(time.time()),
        }

    return None


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
