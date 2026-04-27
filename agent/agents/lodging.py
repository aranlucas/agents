"""Lodging agent with dedicated callback for lodging tools."""

from __future__ import annotations

import time
from typing import Optional

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    LODGING_TOOLS,
    trvl_toolset,
    parse_tool_response,
    update_active_trip,
    filter_mcp_tool_response,
)


LODGING_INSTRUCTION = """Find and compare lodging options. Use lodging tools for hotel search,
room details, pricing, reviews, named properties, and accommodation hacks. Highlight location,
value, and constraints."""


async def lodging_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle lodging-specific tool results: search_hotels."""
    if tool.name != "search_hotels":
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    data = parse_tool_response(tool_response)
    if not data or not data.get("success"):
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    update_active_trip(tool_context, tool.name, args, data)

    # Track hotels by destination for leg association
    destination = args.get("location", args.get("destination", ""))
    hotels = data.get("hotels", [])
    if destination and hotels:
        trip = tool_context.state.get("active_trip", {})
        if "hotels_by_destination" not in trip:
            trip["hotels_by_destination"] = {}
        trip["hotels_by_destination"][destination] = hotels
        tool_context.state["active_trip"] = trip

    return filter_mcp_tool_response(tool, args, tool_context, tool_response)


lodging_agent = LlmAgent(
    name="lodging_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=lodging_after_tool_callback,
    instruction=LODGING_INSTRUCTION,
    tools=[trvl_toolset(LODGING_TOOLS)],
)
