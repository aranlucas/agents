"""Spreadsheet ADK agent."""

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
from pydantic import BaseModel

from .tools import (
    append_rows,
    create_sheet,
    delete_sheet,
    set_active_sheet,
    update_sheet,
    write_summary,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class SpreadsheetState(BaseModel):
    sheets: list = []
    active_sheet_index: int = 0
    summary: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    tools = [
        create_sheet,
        update_sheet,
        append_rows,
        delete_sheet,
        set_active_sheet,
        write_summary,
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="spreadsheet_agent",
        model=LiteLlm(model="groq/llama-3.3-70b-versatile"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=SpreadsheetState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(SpreadsheetState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(include_agui=False)
