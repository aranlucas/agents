"""Oral boards examiner agent domain: state, tools, instructions."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    GEMINI_RETRY_OPTIONS,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.google_llm import Gemini
from google.adk.models.lite_llm import LiteLlm
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
def _build_agent(*, include_agui: bool, model: BaseLlm | None = None) -> LlmAgent:
    """Fresh LlmAgent instance for the oral-boards examiner."""
    tools: list[object] = [
        search_docs,
        read_doc,
        set_case,
        set_phase,
        set_loading_step,
        append_exchange,
        set_score_card,
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="oralboards_agent",
        description="Pediatric dentistry oral-board practice.",
        model=model or LiteLlm(model="cerebras/gpt-oss-120b"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=OralBoardsState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(OralBoardsState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(
        include_agui=False,
        model=Gemini(
            model="gemini-3.1-flash-lite",
            retry_options=GEMINI_RETRY_OPTIONS,
        ),
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset.

    FunctionTool wrappers are kept — they are plain callables, not ADK Toolsets,
    and the Vertex AI eval SDK can introspect them correctly.
    """
    return LlmAgent(
        name="oralboards_agent",
        description="Pediatric dentistry oral-board practice.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
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
        ],
    )


root_agent = build_eval_agent()
