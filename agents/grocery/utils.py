"""Shared utilities — MCP toolset factory and tool callback."""

import os
from typing import Any, Callable, Dict, Optional

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL", "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
)


def _header_provider(context: ReadonlyContext) -> Dict[str, str]:
    """Return auth headers from session state at call time."""
    token: str = context.state.get("kroger_token", "")
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


def parse_tool_response(tool_response: dict | str) -> Optional[dict]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (KeyError, TypeError, AttributeError):
        return None


def save_state(
    tool_context: ToolContext, tool_name: str, structured_content: Any
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    save_state(tool_context, tool.name, parse_tool_response(tool_response))

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response
