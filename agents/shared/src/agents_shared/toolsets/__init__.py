"""Shared MCP toolset factories for common connection patterns."""

from .brave import brave_web_search_toolset
from .http import make_http_mcp_toolset

__all__ = ["brave_web_search_toolset", "make_http_mcp_toolset"]
