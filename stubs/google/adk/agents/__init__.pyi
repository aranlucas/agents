from typing import Any

class BaseAgent:
    name: str
    instruction: Any
    sub_agents: Any
    mode: Any

    def __init__(self, **data: Any) -> None: ...
    def model_copy(self, *, deep: bool = False, **kwargs: Any) -> Any: ...

class LlmAgent(BaseAgent):
    def __init__(self, **data: Any) -> None: ...

def __getattr__(name: str) -> Any: ...
