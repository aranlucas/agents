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
from google.adk.tools import FunctionTool
from pydantic import BaseModel

from .tools.append_rows import append_rows
from .tools.create_sheet import create_sheet
from .tools.delete_sheet import delete_sheet
from .tools.set_active_sheet import set_active_sheet
from .tools.update_sheet import update_sheet
from .tools.write_summary import write_summary

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


class SpreadsheetState(BaseModel):
    sheets: list[dict[str, object]] = []
    active_sheet_index: int = 0
    summary: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    tools: list[object] = [
        FunctionTool(create_sheet),
        FunctionTool(update_sheet),
        FunctionTool(append_rows),
        FunctionTool(delete_sheet),
        FunctionTool(set_active_sheet),
        FunctionTool(write_summary),
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="spreadsheet_agent",
        description="Spreadsheet creation, editing, and summaries.",
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


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset."""
    return LlmAgent(
        name="spreadsheet_agent",
        description="Spreadsheet creation, editing, and summaries.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(SpreadsheetState),
        tools=[
            FunctionTool(create_sheet),
            FunctionTool(update_sheet),
            FunctionTool(append_rows),
            FunctionTool(delete_sheet),
            FunctionTool(set_active_sheet),
            FunctionTool(write_summary),
        ],
    )


root_agent = build_eval_agent()
