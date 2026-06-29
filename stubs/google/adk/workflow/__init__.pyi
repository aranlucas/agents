from typing import Any

from google.adk.agents import BaseAgent

class Graph:
    nodes: list[Any]

    def model_copy(self, *, deep: bool = False, **kwargs: Any) -> Graph: ...

class Workflow(BaseAgent):
    graph: Graph | None
    parent_agent: Any

    def __init__(self, **data: Any) -> None: ...
    def model_post_init(self, context: Any, /) -> None: ...
    def model_copy(self, *, deep: bool = False, **kwargs: Any) -> Any: ...

class FunctionNode(BaseAgent):
    def __init__(self, **data: Any) -> None: ...

START: BaseAgent
