from collections.abc import Callable
from typing import Any

from google.adk.tools.base_tool import BaseTool as BaseTool
from google.adk.tools.base_toolset import BaseToolset as BaseToolset
from google.adk.tools.tool_context import ToolContext as ToolContext

class FunctionTool(BaseTool):
    def __init__(self, func: Callable[..., Any]) -> None: ...

McpToolset = BaseToolset
MCPToolset = BaseToolset

def __getattr__(name: str) -> Any: ...
