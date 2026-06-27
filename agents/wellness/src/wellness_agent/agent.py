"""Wellness agent domain: state, tools, instruction, orchestration."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from fitness_agent.agent import build_agent as build_fitness_agent
from fitness_agent.tools import StravaActivity
from google.adk.agents import LlmAgent
from grocery_agent.agent import build_agent as build_grocery_agent
from grocery_agent.tools import CartItem, PantryItem
from pydantic import BaseModel

from .tools import mark_plan_ready, set_weekly_wellness_plan

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
def build_agent() -> LlmAgent:
    return LlmAgent(
        name="wellness_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=WellnessState,
        instruction=_INSTRUCTION,
        sub_agents=[build_fitness_agent(mode="task"), build_grocery_agent(mode="task")],
        before_agent_callback=make_state_initializer(WellnessState),
        tools=[
            get_current_date,
            set_weekly_wellness_plan,
            mark_plan_ready,
            AGUIToolset(),
        ],
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no state_schema, eval sub-agents.

    Uses eval versions of fitness and grocery so the full sub-agent graph is free
    of McpToolset objects that the Vertex AI eval SDK cannot introspect.
    """
    from fitness_agent.agent import build_eval_agent as build_fitness_eval
    from grocery_agent.agent import build_eval_agent as build_grocery_eval

    return LlmAgent(
        name="wellness_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        sub_agents=[build_fitness_eval(mode="task"), build_grocery_eval(mode="task")],
        tools=[
            get_current_date,
            set_weekly_wellness_plan,
            mark_plan_ready,
        ],
    )


root_agent = build_eval_agent()
