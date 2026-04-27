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
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[itinerary_callback] Tool: {tool.name}, args: {args}")
    logger.info(f"[itinerary_callback] Response: {tool_response}")
    
    if tool.name not in ("create_trip", "add_trip_leg"):
        return None

    data = parse_tool_response(tool_response)
    logger.info(f"[itinerary_callback] Parsed data: {data}")
    
    if not data or data.get("isError"):
        logger.warning(f"[itinerary_callback] No data or isError")
        return None

    if tool.name == "create_trip":
        logger.info(f"[itinerary_callback] Creating trip with data: {data}")
        update_active_trip(tool_context, tool.name, args, data)
        logger.info(f"[itinerary_callback] Active trip after create: {tool_context.state.get('active_trip')}")
    elif tool.name == "add_trip_leg":
        logger.info(f"[itinerary_callback] Adding trip leg with data: {data}")
        new_leg = data.get("leg")
        if new_leg:
            current_trip = tool_context.state.get("active_trip", {})
            current_legs = current_trip.get("legs", [])
            updated_legs = current_legs + [new_leg]
            # Infer origin/destination from legs
            patch = {"legs": updated_legs}
            if updated_legs:
                patch["origin"] = updated_legs[0].get("from", "")
                patch["destination"] = updated_legs[-1].get("to", "")
            merged = merge_active_trip(
                current_trip,
                patch,
                now=int(time.time()),
            )
            tool_context.state["active_trip"] = merged
            logger.info(f"[itinerary_callback] Active trip after add_leg: {tool_context.state.get('active_trip')}")

    return None


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
    after_tool_callback=itinerary_after_tool_callback,
)
