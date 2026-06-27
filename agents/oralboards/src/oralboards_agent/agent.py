"""Oral boards examiner agent domain: state, tools, instructions."""

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

from .tools import (
    CaseSource,
    OralBoardsExchange,
    SkillsetScore,
    append_exchange,
    read_doc,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[CaseSource] = []
    case_passages: str = ""
    transcript: list[OralBoardsExchange] = []
    score_card: str = ""
    score_summary: list[SkillsetScore] = []
    outcome: str = ""
    status: str = "idle"
    loading_step: str = ""
    current_question: str = ""
    interview_complete: bool = False
    active_feedback: str = ""
    active_ideal_response: str = ""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance for the oral-boards examiner."""
    return LlmAgent(
        name="oralboards_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=OralBoardsState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(OralBoardsState),
        tools=[
            search_docs,
            read_doc,
            set_case,
            set_phase,
            set_loading_step,
            append_exchange,
            set_score_card,
            AGUIToolset(),
        ],
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no state_schema.

    FunctionTool wrappers are kept — they are plain callables, not ADK Toolsets,
    and the Vertex AI eval SDK can introspect them correctly.
    """
    return LlmAgent(
        name="oralboards_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        static_instruction=STATIC_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_case),
            FunctionTool(set_phase),
            FunctionTool(set_loading_step),
            FunctionTool(append_exchange),
            FunctionTool(set_score_card),
        ],
    )


root_agent = build_eval_agent()
