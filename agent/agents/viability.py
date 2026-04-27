"""Viability agent with dedicated callback for viability tools."""

from __future__ import annotations

import time
from typing import Optional

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    VIABILITY_TOOLS,
    trvl_toolset,
    parse_tool_response,
    update_active_trip,
    filter_mcp_tool_response,
)


VIABILITY_INSTRUCTION = """Assess whether a trip is practical. Use viability tools for cost,
visa, points, booking optimization, travel hacks, trip windows, date optimization, and multi-city
planning. Call out blockers and concrete next steps."""


async def viability_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle viability-specific tool results: assess_trip."""
    if tool.name != "assess_trip":
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    data = parse_tool_response(tool_response)
    if not data or not data.get("success"):
        return filter_mcp_tool_response(tool, args, tool_context, tool_response)

    update_active_trip(tool_context, tool.name, args, data)
    return filter_mcp_tool_response(tool, args, tool_context, tool_response)


viability_agent = LlmAgent(
    name="viability_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=viability_after_tool_callback,
    instruction=VIABILITY_INSTRUCTION,
    tools=[trvl_toolset(VIABILITY_TOOLS)],
)
