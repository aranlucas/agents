"""Grocery agent MCP toolset factory."""

import os
from typing import TYPE_CHECKING

from agents_shared.invocation_state import get_invocation_temp
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

if TYPE_CHECKING:
    from google.adk.agents.readonly_context import ReadonlyContext

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL",
    "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp",
)
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"


def _header_provider(context: ReadonlyContext) -> dict[str, str]:
    """Return auth headers from session state (or the in-process invocation bridge)."""
    token = get_invocation_temp(KROGER_TOKEN_STATE_KEY, context.state)
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def meal_planner_toolset() -> McpToolset:
    """MCP toolset for the AI Meal Planner. Auth token is read per-request from state."""
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=MEAL_PLANNER_MCP_URL,
            timeout=30.0,
        ),
        header_provider=_header_provider,
        use_mcp_resources=True,
    )
