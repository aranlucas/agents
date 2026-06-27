"""Excalidraw agent — collaborative whiteboard via MCP Apps."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class ExcalidrawState(BaseModel):
    user_id: str = ""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="excalidraw_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ExcalidrawState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExcalidrawState),
        tools=[AGUIToolset()],
    )
