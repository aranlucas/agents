# pyright: reportPrivateUsage=false
"""Tests for the shared Brave Search MCP toolset."""

from agents_shared.toolsets import brave as brave_toolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams


def test_brave_web_search_toolset_uses_npx_when_binary_absent(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(brave_toolset.shutil, "which", lambda _: None)

    toolset = brave_toolset.brave_web_search_toolset()

    params = toolset._connection_params
    assert isinstance(params, StdioConnectionParams)
    assert params.timeout == 30.0
    assert params.server_params.command == "npx"
    assert params.server_params.args == [
        "-y",
        "@brave/brave-search-mcp-server",
        "--brave-api-key",
        "brave-token",
    ]
    assert params.server_params.env == {"BRAVE_API_KEY": "brave-token"}
    assert toolset._use_mcp_resources is False


def test_brave_web_search_toolset_uses_binary_when_installed(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(
        brave_toolset.shutil, "which", lambda name: f"/usr/local/bin/{name}"
    )

    toolset = brave_toolset.brave_web_search_toolset()

    params = toolset._connection_params
    assert isinstance(params, StdioConnectionParams)
    assert params.timeout == 30.0
    assert params.server_params.command == "brave-search-mcp-server"
    assert params.server_params.args == ["--brave-api-key", "brave-token"]
    assert params.server_params.env == {"BRAVE_API_KEY": "brave-token"}
    assert toolset._use_mcp_resources is False
