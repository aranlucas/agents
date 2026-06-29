"""Excalidraw agent — collaborative whiteboard via MCP Apps."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool
from pydantic import BaseModel

from .tools.create_excalidraw_scene import create_excalidraw_scene

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class ExcalidrawState(BaseModel):
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    return LlmAgent(
        name="excalidraw_agent",
        description="Collaborative whiteboard assistant.",
        model=LiteLlm(model="groq/llama-3.3-70b-versatile"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ExcalidrawState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExcalidrawState),
        tools=[AGUIToolset()] if include_agui else [],
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(include_agui=False)


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: local drawing stub, no AGUIToolset/state schema."""
    return LlmAgent(
        name="excalidraw_agent",
        description="Collaborative whiteboard assistant.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        tools=[FunctionTool(create_excalidraw_scene)],
    )


root_agent = build_eval_agent()
