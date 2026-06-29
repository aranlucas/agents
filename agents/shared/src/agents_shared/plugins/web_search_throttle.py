"""Web-search throttling plugin."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, override

from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

log = logging.getLogger(__name__)


class WebSearchThrottlePlugin(BasePlugin):
    """Space out Brave web-search tool calls across an ADK App instance."""

    def __init__(self, *, min_interval_s: float = 1.2) -> None:
        super().__init__(name="web_search_throttle")
        self.min_interval_s = min_interval_s
        self.last_at = 0.0
        self._lock = asyncio.Lock()

    @override
    async def before_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
    ) -> dict[str, Any] | None:
        if not str(getattr(tool, "name", "")).startswith("brave_"):
            return None
        async with self._lock:
            elapsed = time.monotonic() - self.last_at
            if elapsed < self.min_interval_s:
                wait = self.min_interval_s - elapsed
                log.debug(
                    "web_search_throttle: sleeping %.2fs before %s",
                    wait,
                    tool.name,
                )
                await asyncio.sleep(wait)
            self.last_at = time.monotonic()
        return None
