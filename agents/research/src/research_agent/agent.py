"""Research Canvas ADK agent."""

from __future__ import annotations

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
    add_source,
    create_section,
    mark_research_ready,
    set_research_query,
    update_section,
    write_report,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class ResearchState(BaseModel):
    title: str = ""
    query: str = ""
    report: str = ""
    sections: list = Field(default_factory=list)
    sources: list = Field(default_factory=list)
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="research_canvas_agent",
        model=LiteLlm(model="cerebras/gpt-oss-120b"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ResearchState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ResearchState),
        tools=[
            set_research_query,
            create_section,
            update_section,
            add_source,
            write_report,
            mark_research_ready,
            AGUIToolset(),
        ],
    )
