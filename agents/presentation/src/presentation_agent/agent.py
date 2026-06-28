"""Presentation Builder ADK agent."""

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
from pydantic import BaseModel, Field

from .tools import (
    create_slide,
    delete_slide,
    mark_presentation_ready,
    reorder_slides,
    set_presentation_meta,
    update_slide,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class PresentationState(BaseModel):
    title: str = ""
    theme: str = "light"
    slides: list = Field(default_factory=list)
    active_slide_index: int = 0
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    tools = [
        set_presentation_meta,
        create_slide,
        update_slide,
        delete_slide,
        reorder_slides,
        mark_presentation_ready,
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="presentation_agent",
        model=LiteLlm(model="groq/llama-3.3-70b-versatile"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=PresentationState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(PresentationState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(include_agui=False)
