import os

from agents_shared.toolsets import make_http_mcp_toolset
from google.adk.tools.mcp_tool import McpToolset

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")


def trvl_toolset() -> McpToolset:
    return make_http_mcp_toolset(TRVL_MCP_URL, use_mcp_resources=True)
