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
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from .tools.create_slide import create_slide
from .tools.delete_slide import delete_slide
from .tools.mark_presentation_ready import mark_presentation_ready
from .tools.reorder_slides import reorder_slides
from .tools.set_presentation_meta import set_presentation_meta
from .tools.update_slide import update_slide

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class PresentationState(BaseModel):
    title: str = ""
    theme: str = "light"
    slides: list[dict[str, object]] = Field(default_factory=list[dict[str, object]])
    active_slide_index: int = 0
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    tools: list[object] = [
        FunctionTool(set_presentation_meta),
        FunctionTool(create_slide),
        FunctionTool(update_slide),
        FunctionTool(delete_slide),
        FunctionTool(reorder_slides),
        FunctionTool(mark_presentation_ready),
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="presentation_agent",
        description="Presentation outline and slide authoring.",
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


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset."""
    return LlmAgent(
        name="presentation_agent",
        description="Presentation outline and slide authoring.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(PresentationState),
        tools=[
            FunctionTool(set_presentation_meta),
            FunctionTool(create_slide),
            FunctionTool(update_slide),
            FunctionTool(delete_slide),
            FunctionTool(reorder_slides),
            FunctionTool(mark_presentation_ready),
        ],
    )


root_agent = build_eval_agent()
