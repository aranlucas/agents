from collections.abc import AsyncGenerator
from typing import Any

class BaseAgent:
    name: str
    instruction: Any
    sub_agents: Any
    mode: Any

    def __init__(self, **data: Any) -> None: ...
    def model_copy(self, *, deep: bool = False, **kwargs: Any) -> Any: ...
    def run_async(self, parent_context: Any) -> AsyncGenerator[Any, None]: ...

class LlmAgent(BaseAgent):
    def __init__(self, **data: Any) -> None: ...

def __getattr__(name: str) -> Any: ...
