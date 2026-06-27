"""Grocery agent domain: state, tools, instructions."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import (
    KROGER_AUTH,
    make_state_initializer,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel

from .tools import (
    CartItem,
    PantryItem,
    mark_list_ready,
    meal_planner_toolset,
    set_meal_plan,
    set_shopping_list,
    set_weekly_deals,
    update_cart,
    update_pantry,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class GroceryState(BaseModel):
    """Default shared-state shape for the grocery agent."""

    shopping_list: list[str] = []
    meal_plan: str = ""
    cart: list[CartItem] = []
    pantry: list[PantryItem] = []
    weekly_deals: str = ""
    status: str = "idle"
    notes: str = ""
    review_summary: str = ""
    kroger_connected: bool = False
    training_plan: str = ""
    user_id: str = ""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="grocery_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        state_schema=GroceryState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            GroceryState,
            token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag},
        ),
        tools=[
            set_shopping_list,
            update_cart,
            update_pantry,
            set_meal_plan,
            set_weekly_deals,
            mark_list_ready,
            get_current_date,
            AGUIToolset(),
            meal_planner_toolset(),
        ],
    )


def build_eval_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no McpToolset, no state_schema.

    The eval case tests the auth-gate path (kroger_connected=False by default),
    so no Kroger MCP stubs are needed — the agent should refuse before calling them.
    """
    return LlmAgent(
        name="grocery_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        instruction=_INSTRUCTION,
        tools=[
            set_shopping_list,
            update_cart,
            update_pantry,
            set_meal_plan,
            set_weekly_deals,
            mark_list_ready,
            get_current_date,
        ],
    )


root_agent = build_eval_agent()
