"""Transport agent with dedicated callback for transport tools."""

from __future__ import annotations

import time
from typing import Optional
from uuid import uuid4

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    TRANSPORT_TOOLS,
    trvl_toolset,
    _normalize_flights,
    parse_tool_response,
    update_legacy_results,
    update_active_trip,
    filter_mcp_tool_response,
)

TRANSPORT_INSTRUCTION = """Plan transportation for trips from Seattle unless the user specifies
another origin. Use IATA airport codes for flights. Compare price, duration, stops, baggage, ground
transport, and airport transfer options."""


async def transport_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle transport-specific tool results: search_flights, search_route."""
    if tool.name not in ("search_flights", "search_route"):
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    data = parse_tool_response(tool_response)
    if not data or not data.get("success"):
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    # Update active_trip
    update_active_trip(tool_context, tool.name, args, data)
    return filter_mcp_tool_response(tool, args, tool_context, tool_response)


transport_agent = LlmAgent(
    name="transport_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=transport_after_tool_callback,
    instruction=TRANSPORT_INSTRUCTION,
    tools=[trvl_toolset(TRANSPORT_TOOLS)],
)
