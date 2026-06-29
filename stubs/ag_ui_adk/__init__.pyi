from typing import Any

from fastapi import APIRouter, FastAPI
from google.adk.tools.base_toolset import BaseToolset

class AGUIToolset(BaseToolset):
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...


class ADKAgent:
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...

    @classmethod
    def from_app(cls, *args: Any, **kwargs: Any) -> ADKAgent: ...


def add_adk_fastapi_endpoint(
    app: FastAPI | APIRouter, agent: ADKAgent, *, path: str, **kwargs: Any
) -> None: ...


def get_a2ui_tool(config: dict[str, Any]) -> AGUIToolset: ...
