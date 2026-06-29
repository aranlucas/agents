"""Shared ADK plugins applied globally via build_adk_agent."""

from .slim_mcp import SlimMcpPlugin
from .web_search_throttle import WebSearchThrottlePlugin

__all__ = ["SlimMcpPlugin", "WebSearchThrottlePlugin"]
