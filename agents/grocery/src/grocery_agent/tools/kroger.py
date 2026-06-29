import os

from agents_shared.state import KROGER_AUTH, make_token_auth_header_provider
from agents_shared.toolsets import make_http_mcp_toolset
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset
from google.adk.tools.mcp_tool import McpToolset

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL",
    "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp",
)

header_provider = make_token_auth_header_provider(KROGER_AUTH)


def meal_planner_toolset() -> McpToolset:
    """MCP toolset for the AI Meal Planner. Auth token is read per-request from state."""
    return make_http_mcp_toolset(
        MEAL_PLANNER_MCP_URL,
        header_provider=header_provider,
        use_mcp_resources=False,
    )


class KrogerToolset(BaseToolset):
    """Dynamically gates Kroger MCP tools on the kroger_connected session-state flag.

    When kroger_connected is falsy, get_tools() returns an empty list so the LLM
    never sees or attempts to call Kroger APIs. When the flag is truthy, the inner
    meal-planner MCP toolset is initialised on first use and its tools are returned.
    """

    def __init__(self) -> None:
        super().__init__()
        self._inner: McpToolset | None = None

    async def get_tools(
        self, readonly_context: ReadonlyContext | None = None
    ) -> list[BaseTool]:
        if readonly_context is None or not readonly_context.state.get(
            "kroger_connected"
        ):
            return []
        if self._inner is None:
            self._inner = meal_planner_toolset()
        return await self._inner.get_tools(readonly_context)

    async def close(self) -> None:
        if self._inner is not None:
            await self._inner.close()
