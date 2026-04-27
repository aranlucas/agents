"""Itinerary agent with after_tool_callback for trip state updates."""
from __future__ import annotations

from typing import Optional
import time
from uuid import uuid4

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    ITINERARY_TOOLS,
    trvl_toolset,
    parse_tool_response,
    update_active_trip,
    merge_active_trip,
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
        update_active_trip(tool_context, tool.name, args, data.get("structuredContent", data))
    elif tool.name == "add_trip_leg":
        result_data = data.get("structuredContent", data)
        new_leg = result_data.get("leg")
        if new_leg:
            current_trip = tool_context.state.get("active_trip", {})
            current_legs = current_trip.get("legs", [])
            updated_legs = current_legs + [new_leg]
            merged = merge_active_trip(
                current_trip,
                {"legs": updated_legs},
                now=int(time.time()),
            )
            tool_context.state["active_trip"] = merged

    return None


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
