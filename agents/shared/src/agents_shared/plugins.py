"""Shared ADK plugins applied globally via build_adk_agent."""

from __future__ import annotations

from typing import Any, override

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

    @override
    async def after_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        result: dict[str, Any],
    ) -> dict[str, Any] | None:
        if "content" in result and "structuredContent" in result:
            return result["content"]
        return result
