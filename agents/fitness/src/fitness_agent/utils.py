"""Fitness agent MCP toolset factory."""

import os

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

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
