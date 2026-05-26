"""Shared utilities for the fitness agent."""

import os
from typing import Any, Optional

from mcp import StdioServerParameters
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
)

BRAVE_SEARCH_MCP_PACKAGE = "@brave/brave-search-mcp-server"


def web_search_toolset() -> McpToolset:
    brave_api_key = os.getenv("BRAVE_API_KEY", "")
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=[
                    "-y",
                    BRAVE_SEARCH_MCP_PACKAGE,
                    "--brave-api-key",
                    brave_api_key,
                ],
                env={"BRAVE_API_KEY": brave_api_key},
            ),
            timeout=30.0,
        ),
        use_mcp_resources=False,
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict | str]:
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
