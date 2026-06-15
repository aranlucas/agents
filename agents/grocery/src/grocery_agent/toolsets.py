"""Grocery agent MCP toolset factory."""

import os

from agents_shared.state import KROGER_AUTH, make_token_auth_header_provider
from agents_shared.toolsets import make_http_mcp_toolset
from google.adk.tools.mcp_tool import McpToolset

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL",
    "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp",
)

_header_provider = make_token_auth_header_provider(KROGER_AUTH)


def meal_planner_toolset() -> McpToolset:
    """MCP toolset for the AI Meal Planner. Auth token is read per-request from state."""
    return make_http_mcp_toolset(
        MEAL_PLANNER_MCP_URL,
        header_provider=_header_provider,
        use_mcp_resources=True,
    )
