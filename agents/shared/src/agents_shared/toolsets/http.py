"""HTTP MCP toolset factory."""

from collections.abc import Callable

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams


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
