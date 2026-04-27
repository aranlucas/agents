"""Discovery agent with dedicated callback for discovery tools."""
from __future__ import annotations

import time
from typing import Optional
from uuid import uuid4

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext

from utils import (
    DISCOVERY_TOOLS,
    trvl_toolset,
    parse_tool_response,
    update_legacy_results,
)


DISCOVERY_INSTRUCTION = """Find destination and date ideas for weekend trips from Seattle. Use
discovery tools for flexible dates, deals, destination context, weather, and events. Present the
strongest options with timing and tradeoffs."""


async def discovery_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Handle discovery-specific tool results: search_dates."""
    if tool.name != "search_dates":
        return None

    data = parse_tool_response(tool_response)
    if not data or not data.get("success"):
        return None

    key = "date_results"
    dates = data.get("dates", [])
    entry = {
        "id": str(uuid4()),
        "dates": dates,
        "ts": int(time.time()),
        "args": args,
    }
    update_legacy_results(tool_context, key, entry)
    return None


discovery_agent = LlmAgent(
    name="discovery_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=discovery_after_tool_callback,
    instruction=DISCOVERY_INSTRUCTION,
    tools=[trvl_toolset(DISCOVERY_TOOLS)],
)
