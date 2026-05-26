"""Grocery agent MCP toolset factory."""

import os
from typing import Dict

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL", "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
)
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"


def _header_provider(context: ReadonlyContext) -> Dict[str, str]:
    """Return auth headers from session state at call time."""
    token: str = context.state.get(KROGER_TOKEN_STATE_KEY, "")
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
