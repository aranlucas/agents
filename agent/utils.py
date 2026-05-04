"""Shared utilities for travel agents."""

from __future__ import annotations

import json
import os
import time
from typing import Any, Optional

from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")


def trvl_toolset(names: list[str]) -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        tool_filter=names,
        use_mcp_resources=True,
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (json.JSONDecodeError, IndexError, KeyError, TypeError, AttributeError):
        return None


def save_state(
    tool_context: ToolContext,
    tool_name: str,
    structured_content: Any,
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    save_state(
        tool_context,
        tool.name,
        parse_tool_response(tool_response),
    )

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        # Return only the part the LLM needs (strip structuredContent)
        return {"content": tool_response["content"]}
    return tool_response
