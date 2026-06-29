from typing import Any

from google.adk.tools.base_tool import BaseTool

class AgentTool(BaseTool):
    def __init__(self, agent: Any, *args: Any, **kwargs: Any) -> None: ...
