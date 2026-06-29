"""Fitness agent domain: state, tools, instructions."""

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from ag_ui_adk import AGUIToolset
from agents_shared.state import (
    STRAVA_AUTH,
    make_state_initializer,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from agents_shared.toolsets import brave_web_search_toolset
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, FunctionTool
from google.adk.tools.base_toolset import BaseToolset
from pydantic import BaseModel

from .tools._types import StravaActivity
from .tools.fetch_activities import fetch_activities
from .tools.mark_plan_ready import mark_plan_ready
from .tools.set_objective_research import set_objective_research
from .tools.set_training_plan import set_training_plan
from .tools.strava import StravaToolset

log = logging.getLogger("fitness_agent")

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")
AgentMode = Literal["chat", "task", "single_turn"]
IncludeContents = Literal["default", "none"]
FitnessTool = Callable[..., object] | BaseTool | BaseToolset


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class FitnessState(BaseModel):
    """Default shared-state shape for the fitness agent."""

    strava_connected: bool = False
    activities: list[StravaActivity] = []
    activities_synced_at: str = ""
    objective_research: str = ""
    training_plan: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *,
    mode: AgentMode | None = None,
    include_contents: IncludeContents = "default",
    include_agui: bool = True,
    model: str = "groq/llama-3.3-70b-versatile",
) -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    tools: list[FitnessTool] = [
        StravaToolset(),
        get_current_date,
        FunctionTool(set_objective_research),
        FunctionTool(set_training_plan),
        FunctionTool(mark_plan_ready),
    ]
    if include_agui:
        tools.append(AGUIToolset())
    tools.append(brave_web_search_toolset())

    return LlmAgent(
        name="fitness_agent",
        description="Training plans and Strava-backed activity context.",
        model=LiteLlm(model=model),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        state_schema=FitnessState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            FitnessState,
            token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
        ),
        tools=tools,
    )


def build_telegram_agent(
    *, mode: AgentMode | None = None, include_contents: IncludeContents = "default"
) -> LlmAgent:
    return build_agent(
        mode=mode,
        include_contents=include_contents,
        include_agui=False,
        model="mistral/mistral-medium-latest",
    )


def build_eval_agent(
    *, mode: AgentMode | None = None, include_contents: IncludeContents = "default"
) -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset or McpToolset.

    The eval case tests the auth-gate path (strava_connected=False by default).
    fetch_activities gracefully returns an error when disconnected, so no stub needed.
    """
    return LlmAgent(
        name="fitness_agent",
        description="Training plans and Strava-backed activity context.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            FitnessState,
            token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
        ),
        tools=[
            FunctionTool(fetch_activities),
            get_current_date,
            FunctionTool(set_objective_research),
            FunctionTool(set_training_plan),
            FunctionTool(mark_plan_ready),
        ],
    )


root_agent = build_eval_agent()
