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
            return None
        
        # Initialize legs list if needed
        if "legs" not in trip or not isinstance(trip["legs"], list):
            trip["legs"] = []
        
        # Append new leg
        trip["legs"].append(new_leg)
        
        # Update origin/destination from legs
        legs = trip["legs"]
        if legs:
            trip["origin"] = legs[0].get("from", "")
            trip["destination"] = legs[-1].get("to", "")
        
        trip["updated_at"] = int(time.time())

    return None


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
