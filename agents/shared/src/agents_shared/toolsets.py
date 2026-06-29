"""Shared MCP toolset factories for common connection patterns."""

import os
import shutil
from collections.abc import Callable

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from mcp import StdioServerParameters

BRAVE_SEARCH_MCP_BINARY = "brave-search-mcp-server"
BRAVE_SEARCH_MCP_PACKAGE = "@brave/brave-search-mcp-server"

__all__ = ["brave_web_search_toolset", "make_http_mcp_toolset"]


def make_http_mcp_toolset(
    url: str,
    *,
    header_provider: Callable[..., dict[str, str]] | None = None,
    use_mcp_resources: bool = True,
    timeout: float = 30.0,
) -> McpToolset:
    """Create an MCP toolset for a streamable-HTTP MCP server.

    Args:
        url: The MCP server URL.
        header_provider: Optional per-request header callback (e.g., auth headers
            from ADK session state). See ``make_token_auth_header_provider``.
        use_mcp_resources: Whether to register MCP resources as ADK tools.
        timeout: Connection timeout in seconds.
    """
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(url=url, timeout=timeout),
        header_provider=header_provider,
        use_mcp_resources=use_mcp_resources,
    )


def brave_web_search_toolset() -> McpToolset:
    """Create the shared Brave Search MCP toolset."""
    brave_api_key = os.getenv("BRAVE_API_KEY", "")
    if shutil.which(BRAVE_SEARCH_MCP_BINARY):
        command = BRAVE_SEARCH_MCP_BINARY
        args = ["--brave-api-key", brave_api_key]
    else:
        command = "npx"
        args = ["-y", BRAVE_SEARCH_MCP_PACKAGE, "--brave-api-key", brave_api_key]
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=command,
                args=args,
                env={"BRAVE_API_KEY": brave_api_key},
            ),
            timeout=30.0,
        ),
        use_mcp_resources=False,
    )
