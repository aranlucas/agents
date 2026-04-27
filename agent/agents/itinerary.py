"""Itinerary agent with after_tool_callback for trip state updates."""
from __future__ import annotations

from typing import Any, Optional

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    ITINERARY_TOOLS,
    trvl_toolset,
    parse_tool_response,
    filter_mcp_tool_response,
    update_active_trip,
)

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. 

When creating multi-destination trips (e.g., Seattle -> Vancouver -> Whistler -> Seattle):
1. Call create_trip first with a descriptive name
2. Add ALL trip legs using update_trip in order - do NOT skip any legs
3. For road trips, use type="road_trip" and provider="personal_car" (or "rental_car")
4. For flights, use type="flight" and specify airline as provider
5. Ensure the complete route is captured: every destination must have a leg to it AND from it

After adding all legs, confirm the trip is complete by listing all legs back to the user.

Use itinerary tools to create, list, retrieve, update, mark booked, export calendars, create price
watches, list watches, check watches, and review watch opportunities. Use profile context only when
saved preferences or booking history are needed to complete the itinerary accurately."""


async def itinerary_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle itinerary tool results that update active_trip."""
    data = parse_tool_response(tool_response)
    if data and not data.get("isError"):
        update_active_trip(tool_context, tool.name, args, data)
    return filter_mcp_tool_response(tool, args, tool_context, tool_response)


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
