"""Shared ADK plugins applied globally via build_adk_agent."""

from __future__ import annotations

from typing import Any

from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext


class SlimMcpPlugin(BasePlugin):
    """Drop structuredContent from MCP tool results to halve token usage.

    ADK model_dumps the full CallToolResult including structuredContent, which
    doubles the context consumed by each MCP tool call when the server returns
    both representations. This plugin strips it in after_tool_callback.

    See https://github.com/google/adk-python/discussions/3893
    """

    def __init__(self) -> None:
        super().__init__(name="slim_mcp")

    async def after_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        tool_result: dict[str, Any],
    ) -> dict[str, Any] | None:
        if "structuredContent" not in tool_result:
            return None
        return {k: v for k, v in tool_result.items() if k != "structuredContent"}
