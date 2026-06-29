"""Wellness agent domain: state, tools, instruction, orchestration."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from fitness_agent.agent import build_agent as build_fitness_agent
from fitness_agent.agent import build_telegram_agent as build_fitness_telegram_agent
from fitness_agent.tools._types import StravaActivity
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool
from grocery_agent.agent import build_agent as build_grocery_agent
from grocery_agent.agent import build_telegram_agent as build_grocery_telegram_agent
from grocery_agent.tools._types import CartItem, PantryItem
from pydantic import BaseModel

from .tools.mark_plan_ready import mark_plan_ready
from .tools.set_weekly_wellness_plan import set_weekly_wellness_plan

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class WellnessState(BaseModel):
    """Combined shared-state shape used by wellness and its task sub-agents."""

    status: str = "idle"
    meal_plan: str = ""
    weekly_plan: str = ""
    review_summary: str = ""
    user_id: str = ""
    kroger_connected: bool = False
    strava_connected: bool = False
    shopping_list: list[str] = []
    cart: list[CartItem] = []
    pantry: list[PantryItem] = []
    weekly_deals: str = ""
    notes: str = ""
    activities: list[StravaActivity] = []
    activities_synced_at: str = ""
    objective_research: str = ""
    training_plan: str = ""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def _build_agent(
    *, include_agui: bool, include_telegram_subagents: bool, model: str
) -> LlmAgent:
    build_fitness = (
        build_fitness_telegram_agent
        if include_telegram_subagents
        else build_fitness_agent
    )
    build_grocery = (
        build_grocery_telegram_agent
        if include_telegram_subagents
        else build_grocery_agent
    )
    tools: list[object] = [
        get_current_date,
        FunctionTool(set_weekly_wellness_plan),
        FunctionTool(mark_plan_ready),
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="wellness_agent",
        description="In-process grocery and fitness orchestration.",
        model=LiteLlm(model=model),
        rerun_on_resume=True,
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=WellnessState,
        instruction=_INSTRUCTION,
        sub_agents=[build_fitness(mode="task"), build_grocery(mode="task")],
        before_agent_callback=make_state_initializer(WellnessState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(
        include_agui=True,
        include_telegram_subagents=False,
        model="groq/llama-3.3-70b-versatile",
    )


def build_telegram_agent() -> LlmAgent:
    return _build_agent(
        include_agui=False,
        include_telegram_subagents=True,
        model="mistral/mistral-medium-latest",
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, eval sub-agents.

    Uses eval versions of fitness and grocery so the full sub-agent graph is free
    of McpToolset objects that the Vertex AI eval SDK cannot introspect.
    """
    from fitness_agent.agent import build_eval_agent as build_fitness_eval
    from grocery_agent.agent import build_eval_agent as build_grocery_eval

    return LlmAgent(
        name="wellness_agent",
        description="In-process grocery and fitness orchestration.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(WellnessState),
        sub_agents=[build_fitness_eval(mode="task"), build_grocery_eval(mode="task")],
        tools=[
            get_current_date,
            FunctionTool(set_weekly_wellness_plan),
            FunctionTool(mark_plan_ready),
        ],
    )


root_agent = build_eval_agent()
