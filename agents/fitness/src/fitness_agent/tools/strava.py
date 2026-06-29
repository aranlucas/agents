"""Strava toolset — provides fetch_activities only when strava_connected is True."""

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset

from .fetch_activities import tool as fetch_activities_tool


class StravaToolset(BaseToolset):
    """Dynamically gates Strava tools on the strava_connected session-state flag.

    When strava_connected is falsy (not yet linked), get_tools() returns an
    empty list so the LLM never sees or attempts to call Strava APIs.
    When the flag is truthy, fetch_activities is returned as a callable tool.
    """

    async def get_tools(
        self, readonly_context: ReadonlyContext | None = None
    ) -> list[BaseTool]:
        if readonly_context is None or not readonly_context.state.get(
            "strava_connected"
        ):
            return []
        return [fetch_activities_tool]
