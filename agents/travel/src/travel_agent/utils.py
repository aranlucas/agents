"""Travel agent MCP toolset factory."""

import os

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")


def trvl_toolset() -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        use_mcp_resources=True,
    )
